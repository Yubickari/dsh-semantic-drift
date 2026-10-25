/**
 * Workspace walker.
 *
 * Ordering is deterministic (directories and files are visited in name order) so
 * two scans of an unchanged tree produce byte-identical findings. Nothing here
 * writes: the scanner's read-only promise starts at this module.
 *
 * @module dsh-semantic-drift/scan/walk
 */

import { readdir, stat } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { isScannable } from './symbol-table.ts'
import { matchesGlobs } from '../glob.ts'
import type { GlobSet } from '../glob.ts'

/** Directories never descended into, even when `exclude` is edited to allow them. */
const HARD_SKIP_DIRS = new Set(['.git', 'node_modules', '.hg', '.svn', '.dsh/cache'])

/** File names that mark a compilation unit (project/package) boundary. */
const UNIT_MARKERS = new Set([
  'package.json',
  'tsconfig.json',
  'pyproject.toml',
  'setup.py',
  'go.mod',
  'Cargo.toml',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'composer.json',
  'CMakeLists.txt',
])

/** One file the scanner may read. */
export interface WalkedFile {
  relPath: string
  absPath: string
  bytes: number
}

/** Walk outcome. */
export interface WalkResult {
  root: string
  files: WalkedFile[]
  /** Workspace-relative directories that contain a project marker file. */
  unitDirs: Set<string>
  dirsVisited: number
  skippedBySize: number
  skippedUnreadable: number
  /** True when the file cap was reached and the walk stopped early. */
  truncated: boolean
}

/** One walk request. */
export interface WalkOptions {
  root: string
  excludes: GlobSet
  maxFileBytes: number
  /** Cap on files returned; the caller reports truncation. */
  maxFiles?: number
}

function isUnitMarker(name: string): boolean {
  if (UNIT_MARKERS.has(name)) return true
  return /\.(csproj|fsproj|vbproj|sln|gemspec)$/i.test(name)
}

/**
 * Resolve the compilation unit of a workspace-relative file.
 *
 * The nearest enclosing directory that holds a project marker wins; when there
 * is none, the first path segment is used so a flat repository still separates
 * its top-level folders. This is what makes "the same type in two projects"
 * expressible without a build-system model.
 */
export function makeUnitResolver(unitDirs: ReadonlySet<string>): (relPath: string) => string {
  return (relPath: string): string => {
    const segments = relPath.split('/')
    segments.pop()
    for (let depth = segments.length; depth > 0; depth--) {
      const candidate = segments.slice(0, depth).join('/')
      if (unitDirs.has(candidate)) return candidate
    }
    return segments[0] ?? '.'
  }
}

/**
 * Walk one workspace.
 * @param options - root, exclusions, size and file caps.
 */
export async function walkWorkspace(options: WalkOptions): Promise<WalkResult> {
  const root = resolve(options.root)
  const maxFiles = options.maxFiles ?? 50_000
  const files: WalkedFile[] = []
  const unitDirs = new Set<string>()
  let dirsVisited = 0
  let skippedBySize = 0
  let skippedUnreadable = 0
  let truncated = false

  const queue: string[] = ['']
  while (queue.length > 0) {
    if (files.length >= maxFiles) {
      truncated = true
      break
    }
    // Depth-first with reversed pushes: projects are visited one at a time, in
    // name order, which makes the first definition in a report the one a reader
    // reaches first in the tree.
    const relativeDir = queue.pop() as string
    const absoluteDir = relativeDir === '' ? root : join(root, relativeDir.split('/').join(sep))
    let entries
    try {
      entries = await readdir(absoluteDir, { withFileTypes: true })
    } catch {
      skippedUnreadable++
      continue
    }
    dirsVisited++
    entries.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0))
    const children: string[] = []
    let hasMarker = false
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory()) {
        if (HARD_SKIP_DIRS.has(entry.name)) continue
        const childRel = relativeDir === '' ? entry.name : `${relativeDir}/${entry.name}`
        if (matchesGlobs(options.excludes, childRel, true)) continue
        children.push(childRel)
        continue
      }
      if (!entry.isFile()) continue
      if (isUnitMarker(entry.name)) hasMarker = true
      if (!isScannable(entry.name)) continue
      const childRel = relativeDir === '' ? entry.name : `${relativeDir}/${entry.name}`
      if (matchesGlobs(options.excludes, childRel, false)) continue
      const absolute = join(root, childRel.split('/').join(sep))
      let size = 0
      try {
        const info = await stat(absolute)
        size = info.size
      } catch {
        skippedUnreadable++
        continue
      }
      if (size > options.maxFileBytes) {
        skippedBySize++
        continue
      }
      files.push({ relPath: childRel, absPath: absolute, bytes: size })
      if (files.length >= maxFiles) {
        truncated = true
        break
      }
    }
    if (hasMarker) unitDirs.add(relativeDir)
    queue.push(...children.reverse())
  }

  return { root, files, unitDirs, dirsVisited, skippedBySize, skippedUnreadable, truncated }
}
