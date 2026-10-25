/**
 * Left column: concepts grouped by the first segment of their id.
 *
 * The tree owns collapsing only; search, the drift filter and the drift counts
 * are passed in, so the panel stays the single owner of "what is visible".
 *
 * @module dsh-semantic-drift/client/ConceptTree
 */

import { useState } from 'react'
import type { Concept } from '../protocol.ts'
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
  /** Open the new-concept editor; a group pre-fills the id prefix. */
  onAdd: (group?: string) => void
}

interface Group {
  name: string
  concepts: Concept[]
}

function groupConcepts(concepts: readonly Concept[]): Group[] {
  const groups = new Map<string, Concept[]>()
  for (const concept of concepts) {
    const name = concept.id.split('.')[0] ?? 'other'
    const list = groups.get(name)
    if (list === undefined) groups.set(name, [concept])
    else list.push(concept)
  }
  return [...groups.entries()]
    .map(([name, list]) => ({ name, concepts: list }))
    .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0))
}

export function ConceptTree(props: ConceptTreeProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const groups = groupConcepts(props.concepts)

  const toggle = (name: string) => {
    setCollapsed(current => ({ ...current, [name]: current[name] !== true }))
  }

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
        {groups.length === 0 && (
          <div className="sd-empty" style={{ minHeight: 120, padding: 16 }}>
            <div className="sd-empty-title">{t('tree.empty')}</div>
            <div>{t('tree.emptyHint')}</div>
          </div>
        )}
        {groups.map(group => {
          const open = collapsed[group.name] !== true
          return (
            <div className="sd-group" key={group.name}>
              <div className="sd-group-row">
                <button type="button" className="sd-group-head" onClick={() => toggle(group.name)}>
                  <span className="sd-caret" data-open={open}>
                    <CaretIcon />
                  </span>
                  {group.name}
                  <span className="sd-count">{group.concepts.length}</span>
                </button>
                <button
                  type="button"
                  className="sd-add"
                  title={t('tree.addInGroup')}
                  aria-label={t('tree.addInGroup')}
                  onClick={() => props.onAdd(group.name)}
                >
                  <PlusIcon size={13} />
                </button>
              </div>
              {open && group.concepts.map(concept => {
                const drift = props.driftCounts.get(concept.id) ?? 0
                return (
                  <button
                    key={concept.id}
                    type="button"
                    className="sd-item"
                    data-active={props.selectedId === concept.id}
                    onClick={() => props.onSelect(concept.id)}
                    title={concept.id}
                  >
                    <span className="sd-item-name">{concept.id.split('.').slice(1).join('.') || concept.id}</span>
                    <span className="sd-item-symbol">{concept.canonical.symbol}</span>
                    {drift > 0 && (
                      <span className="sd-count" data-tone="warn">{drift}</span>
                    )}
                  </button>
                )
              })}
            </div>
          )
        })}
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
