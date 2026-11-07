/**
 * Left column: concepts as a tree over the dot-separated id segments.
 *
 * The vocabulary store already accepts any number of segments (`a.b.c`), so the
 * only thing this component owns is presentation: a trie built from the filtered
 * concepts, an expand/collapse state keyed by full path, and an add button on
 * every branch that pre-fills the next segment.
 *
 * A node can be both a concept and a branch. Its row selects the concept, while
 * the caret beside it expands the children, so `device.temperature` and
 * `device.temperature.target` can both be reached.
 *
 * Search, the drift filter and the drift counts are passed in, so the panel
 * stays the single owner of "what is visible".
 *
 * @module dsh-semantic-drift/client/ConceptTree
 */

import { useMemo, useState } from 'react'
import type { Concept } from '../protocol.ts'
import { buildConceptTree } from './concept-tree.ts'
import type { ConceptTreeNode } from './concept-tree.ts'
import { t } from './locales.ts'
import { CaretIcon, PlusIcon, SearchIcon } from './icons.tsx'

/** Props of the concept tree. */
export interface ConceptTreeProps {
  concepts: readonly Concept[]
  selectedId: string | null
  query: string
  onQuery: (value: string) => void
  filter: 'all' | 'drift' | 'clean'
  onFilter: (value: 'all' | 'drift' | 'clean') => void
  driftCounts: Map<string, number>
  unclassified: number
  showUnclassified: boolean
  onSelect: (id: string) => void
  onSelectUnclassified: () => void
  /** Open the new-concept editor; a branch pre-fills its id prefix. */
  onAdd: (prefix?: string) => void
}

/** One row and its descendants. */
interface BranchProps {
  node: ConceptTreeNode
  depth: number
  isOpen: (path: string) => boolean
  selectedId: string | null
  onToggle: (path: string) => void
  onSelect: (id: string) => void
  onAdd: (prefix: string) => void
}

function Branch(props: BranchProps) {
  const { node, depth } = props
  const open = props.isOpen(node.path)
  const hasChildren = node.children.length > 0
  const concept = node.concept
  const active = concept !== undefined && props.selectedId === concept.id
  const rowClass = depth === 0 ? 'sd-group-row' : 'sd-node-row'
  const labelClass = depth === 0 ? 'sd-group-head' : 'sd-node-label'
  // A concept at an intermediate node is one of its own subtree entries; the
  // badge the user reads is the number of child ids, not the subtree total.
  const childCount = node.count - (concept === undefined ? 0 : 1)
  const showCount = concept === undefined || hasChildren

  return (
    <div className={depth === 0 ? 'sd-group' : 'sd-node'}>
      <div
        className={rowClass}
        data-selected={active ? 'true' : undefined}
        style={depth === 0 ? undefined : { paddingLeft: 4 + (depth - 1) * 12 }}
      >
        {hasChildren ? (
          <button
            type="button"
            className="sd-caret-button"
            aria-expanded={open}
            aria-label={`${open ? t('tree.collapse') : t('tree.expand')} ${node.path}`}
            onClick={() => props.onToggle(node.path)}
          >
            <span className="sd-caret" data-open={open}>
              <CaretIcon />
            </span>
          </button>
        ) : (
          <span className="sd-caret-spacer" aria-hidden="true" />
        )}
        <button
          type="button"
          className={labelClass}
          data-active={active ? 'true' : undefined}
          title={node.path}
          onClick={() => {
            if (concept !== undefined) props.onSelect(concept.id)
            else props.onToggle(node.path)
          }}
        >
          <span className="sd-node-text">
            <span className="sd-node-line">
              <span className="sd-node-id">{node.segment}</span>
              <span className="sd-node-badges">
                {showCount && <span className="sd-count">{childCount}</span>}
                {node.drift > 0 && <span className="sd-count" data-tone="warn">{node.drift}</span>}
              </span>
            </span>
            {concept !== undefined && (
              <span className="sd-node-symbol">{concept.canonical.symbol}</span>
            )}
          </span>
        </button>
        {hasChildren && (
          <button
            type="button"
            className="sd-add"
            title={t('tree.addInGroup')}
            aria-label={`${t('tree.addInGroup')} ${node.path}`}
            onClick={() => props.onAdd(node.path)}
          >
            <PlusIcon size={depth === 0 ? 13 : 12} />
          </button>
        )}
      </div>
      {open && hasChildren && (
        <div className={depth === 0 ? 'sd-group-children' : 'sd-node-children'}>
          {node.children.map(child => (
            <Branch
              key={child.path}
              node={child}
              depth={depth + 1}
              isOpen={props.isOpen}
              selectedId={props.selectedId}
              onToggle={props.onToggle}
              onSelect={props.onSelect}
              onAdd={props.onAdd}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function ConceptTree(props: ConceptTreeProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const tree = useMemo(
    () => buildConceptTree(props.concepts, props.driftCounts),
    [props.concepts, props.driftCounts],
  )
  const searching = props.query.trim() !== ''

  const toggle = (path: string) => {
    setCollapsed(current => ({ ...current, [path]: current[path] !== true }))
  }

  /** Search must reveal what matched, even inside a branch collapsed earlier. */
  const isOpen = (path: string): boolean => searching || collapsed[path] !== true

  return (
    <aside className="sd-tree">
      <div className="sd-tree-head">
        <span className="sd-tree-title">{t('tree.title')}</span>
        <span className="sd-count">{props.concepts.length}</span>
        <button
          type="button"
          className="sd-add"
          title={t('action.new')}
          aria-label={t('action.new')}
          onClick={() => props.onAdd()}
        >
          <PlusIcon size={15} />
        </button>
      </div>
      <div className="sd-tree-tools">
        <div className="sd-search">
          <span className="sd-search-icon">
            <SearchIcon />
          </span>
          <input
            className="sd-input"
            value={props.query}
            placeholder={t('search.placeholder')}
            onChange={event => props.onQuery(event.target.value)}
            spellCheck={false}
          />
        </div>
        <div className="sd-filters">
          {(['all', 'drift', 'clean'] as const).map(value => (
            <button
              key={value}
              type="button"
              className="sd-chip"
              data-active={props.filter === value}
              onClick={() => props.onFilter(value)}
            >
              {t(value === 'all' ? 'filter.all' : value === 'drift' ? 'filter.drift' : 'filter.clean')}
            </button>
          ))}
        </div>
      </div>
      <div className="sd-tree-list">
        {tree.length === 0 && (
          <div className="sd-empty" style={{ minHeight: 120, padding: 16 }}>
            <div className="sd-empty-title">{t('tree.empty')}</div>
            <div>{t('tree.emptyHint')}</div>
          </div>
        )}
        {tree.map(node => (
          <Branch
            key={node.path}
            node={node}
            depth={0}
            isOpen={isOpen}
            selectedId={props.selectedId}
            onToggle={toggle}
            onSelect={props.onSelect}
            onAdd={props.onAdd}
          />
        ))}
        {props.showUnclassified && (
          <div className="sd-group">
            <button
              type="button"
              className="sd-item"
              data-active={props.selectedId === null}
              onClick={props.onSelectUnclassified}
              style={{ paddingLeft: 8 }}
            >
              <span className="sd-item-name">{t('tree.unclassified')}</span>
              <span className="sd-count" data-tone={props.unclassified > 0 ? 'warn' : undefined}>{props.unclassified}</span>
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}
