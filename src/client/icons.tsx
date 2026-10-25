/**
 * Panel glyphs. All are stroke-only SVGs on `currentColor`, so they follow the
 * theme and the sidebar's active/inactive tint without a second stylesheet.
 *
 * @module dsh-semantic-drift/client/icons
 */

interface IconProps {
  size?: number
}

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.4,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
})

export function SidebarIcon({ size = 16 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M3 3.5h10v9H3z" />
      <path d="M5.4 6.2h5.2M5.4 8.4h3.1" />
      <path d="M11.4 8.4h.1M8.1 10.6h3.4" strokeDasharray="0.1 2.2" />
      <circle cx="10.4" cy="8.4" r="1.5" strokeWidth="1.1" />
    </svg>
  )
}

export function SearchIcon({ size = 14 }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="7" cy="7" r="4.2" />
      <path d="M10.2 10.2 13.4 13.4" />
    </svg>
  )
}

export function RefreshIcon({ size = 14 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M13 8a5 5 0 1 1-1.6-3.7" />
      <path d="M13 2.6V5h-2.4" />
    </svg>
  )
}

export function PlusIcon({ size = 14 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M8 3.2v9.6M3.2 8h9.6" />
    </svg>
  )
}

export function CodeIcon({ size = 14 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M5.6 4.4 2.6 8l3 3.6M10.4 4.4 13.4 8l-3 3.6" />
    </svg>
  )
}

export function CaretIcon({ size = 12 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M4.2 6.2 8 10l3.8-3.8" />
    </svg>
  )
}

export function CopyIcon({ size = 13 }: IconProps) {
  return (
    <svg {...base(size)}>
      <rect x="5.6" y="2.8" width="7.6" height="8.4" rx="1.4" />
      <path d="M10.4 13.2H4.2a1.4 1.4 0 0 1-1.4-1.4V5.2" />
    </svg>
  )
}

export function CheckIcon({ size = 13 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M3.2 8.4 6.4 11.6 12.8 4.8" />
    </svg>
  )
}

export function CloseIcon({ size = 12 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  )
}

/** Pushpin: the panel stays on the workspace you picked. Three strokes, no detail. */
export function PinIcon({ size = 14 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M6.2 3.2h3.6" />
      <path d="M7 3.2v3.2L5.4 8.4h5.2L9 6.4V3.2" />
      <path d="M8 8.4v4.8" />
    </svg>
  )
}

/** Crosshair: the panel follows the session's workspace. */
export function FollowIcon({ size = 14 }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="8" cy="8" r="4.4" />
      <circle cx="8" cy="8" r="1.2" fill="currentColor" stroke="none" />
      <path d="M8 1.4v1.9M8 12.7v1.9M1.4 8h1.9M12.7 8h1.9" />
    </svg>
  )
}

export function SettingsIcon({ size = 14 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M2.6 4.6h10.8M2.6 8h10.8M2.6 11.4h10.8" />
      <circle cx="6.2" cy="4.6" r="1.5" />
      <circle cx="10.4" cy="8" r="1.5" />
      <circle cx="5.4" cy="11.4" r="1.5" />
    </svg>
  )
}

export function TrashIcon({ size = 13 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M3 4.6h10M6.4 4.6V3.4h3.2v1.2M4.4 4.6l.6 8.2h6l.6-8.2M6.6 7v3.6M9.4 7v3.6" />
    </svg>
  )
}

export function EditIcon({ size = 13 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M10.6 2.9l2.5 2.5-7 7-3.2.7.7-3.2z" />
    </svg>
  )
}
