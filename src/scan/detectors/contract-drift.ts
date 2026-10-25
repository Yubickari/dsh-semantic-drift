/**
 * D1b/D4 — the same type declared in two compilation units with different
 * members, i.e. a boundary whose two sides disagree about the contract.
 *
 * This is the dangerous branch of the D1 comparison: the copies have already
 * diverged, so a value produced on one side may not be understood on the other.
 * A finding carries the exact missing/extra member names, because "these two
 * enums differ" is useless without the difference.
 *
 * @module dsh-semantic-drift/scan/detectors/contract-drift
 */

import { makeFinding } from '../types.ts'
import type { Detector } from '../types.ts'
import type { DriftFinding } from '../../protocol.ts'
import { comparableDeclarations, groupTypesByName } from './duplicate-type.ts'

export const contractDriftDetector: Detector = {
  id: 'contract-drift',
  finish(ctx): DriftFinding[] {
    const findings: DriftFinding[] = []
    for (const [name, declarations] of groupTypesByName(ctx.types)) {
      const comparable = comparableDeclarations(declarations)
      if (comparable.length < 2) continue
      const units = new Set(comparable.map(declaration => declaration.unit))
      if (units.size < 2) continue
      const primary = comparable[0]
      const primaryMembers = new Set(primary.members)
      for (const declaration of comparable.slice(1)) {
        if (declaration.unit === primary.unit || declaration.path === primary.path) continue
        const members = new Set(declaration.members)
        if (members.size === primaryMembers.size && [...members].every(member => primaryMembers.has(member))) continue
        const missing = primary.members.filter(member => !members.has(member))
        const extra = declaration.members.filter(member => !primaryMembers.has(member))
        // Nothing in common means the two declarations are different types that
        // happen to share a name (a `MainWindow` per application, say). Reporting
        // that as diverged vocabulary would be a name collision, not drift.
        if (missing.length === primary.members.length) continue
        const concept = ctx.concepts.find(item => item.canonical.symbol === name)
        const difference = [
          missing.length === 0 ? '' : `missing [${missing.join(', ')}]`,
          extra.length === 0 ? '' : `extra [${extra.join(', ')}]`,
        ]
          .filter(part => part !== '')
          .join(', ')
        findings.push(
          makeFinding(ctx.citationStyle, {
            detector: 'contract-drift',
            confidence: 'high',
            path: declaration.path,
            line: declaration.line,
            symbol: name,
            ...(concept === undefined ? {} : { conceptId: concept.id }),
            message: `Type "${name}" differs between ${primary.path} and ${declaration.path}: ${difference}.`,
            detail: {
              primaryPath: primary.path,
              primaryLine: primary.line,
              unit: declaration.unit,
              members: primary.members,
              missing,
              extra,
              rule: 'diverged-members',
            },
          }),
        )
      }
    }
    return findings
  },
}
