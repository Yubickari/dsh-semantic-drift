/**
 * Pure helpers behind the panel's concept tree.
 *
 * The tree is derived state: the vocabulary file is the only source, and a node
 * is just one dot-separated id segment. Keeping the derivation here, as an
 * ordinary function, is what lets the shape be tested without a browser.
 *
 * A node may be both a concept and a branch: `device.temperature` and
 * `device.temperature.target` are two valid ids, so the `temperature` node
 * carries a concept and children at the same time. The builder never prunes
 * that node, and the count includes both.
 *
 * @module dsh-semantic-drift/client/concept-tree
 */

import type { Concept } from '../protocol.ts'

/** One node of the concept tree. */
export interface ConceptTreeNode {
  /** The id segment this node represents, e.g. `temperature`. */
  segment: string
  /** Full dotted path, e.g. `device.temperature`. Stable collapse key. */
  path: string
  /** The concept declared exactly at this path, when one exists. */
  concept?: Concept
  /** Child branches, sorted by segment. */
  children: ConceptTreeNode[]
  /** Concepts at or below this node. */
  count: number
  /** Findings at or below this node, 0 when no counts were supplied. */
  drift: number
}

/** Mutable trie node used while building; converted to the public shape at the end. */
interface MutableNode {
  segment: string
  path: string
  concept?: Concept
  children: Map<string, MutableNode>
}

function compareSegments(left: MutableNode, right: MutableNode): number {
  return left.segment < right.segment ? -1 : left.segment > right.segment ? 1 : 0
}

/**
 * Build the tree of one concept list.
 *
 * Ids are normalized by the store to lowercase dotted segments, so the split is
 * deliberately literal: no trimming or case folding here, because a tree that
 * silently rewrites an id would hide a validation problem.
 *
 * @param concepts - concepts to show, already filtered by the panel.
 * @param driftCounts - per-concept finding counts, for the aggregate badges.
 */
export function buildConceptTree(
  concepts: readonly Concept[],
  driftCounts?: ReadonlyMap<string, number>,
): ConceptTreeNode[] {
  const roots = new Map<string, MutableNode>()

  for (const concept of concepts) {
    const segments = concept.id.split('.').filter(segment => segment !== '')
    if (segments.length === 0) continue
    let level = roots
    let path = ''
    for (const [index, segment] of segments.entries()) {
      path = path === '' ? segment : `${path}.${segment}`
      let node = level.get(segment)
      if (node === undefined) {
        node = { segment, path, children: new Map() }
        level.set(segment, node)
      }
      if (index === segments.length - 1) node.concept = concept
      level = node.children
    }
  }

  const finish = (node: MutableNode): ConceptTreeNode => {
    const children = [...node.children.values()].sort(compareSegments).map(finish)
    const own = node.concept === undefined ? 0 : 1
    const drift = node.concept === undefined ? 0 : (driftCounts?.get(node.concept.id) ?? 0)
    return {
      segment: node.segment,
      path: node.path,
      ...(node.concept === undefined ? {} : { concept: node.concept }),
      children,
      count: own + children.reduce((sum, child) => sum + child.count, 0),
      drift: drift + children.reduce((sum, child) => sum + child.drift, 0),
    }
  }

  return [...roots.values()].sort(compareSegments).map(finish)
}
