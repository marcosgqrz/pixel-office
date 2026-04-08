export interface ActionZone {
  id: string
  label: string
  icon: string
  /** Top-left tile col */
  col: number
  /** Top-left tile row */
  row: number
  /** Width in tiles */
  w: number
  /** Height in tiles */
  h: number
  /** Color for the glow overlay (CSS rgba) */
  color: string
  /** Target tiles characters walk to when zone is triggered */
  targetTiles: Array<{ col: number; row: number }>
}

export const ACTION_ZONES: ActionZone[] = [
  {
    id: 'conference',
    label: 'Reunião',
    icon: '🤝',
    col: 1, row: 1, w: 11, h: 7,
    color: 'rgba(99,102,241,0.18)',
    targetTiles: [
      { col: 2, row: 2 }, { col: 5, row: 2 }, { col: 8, row: 2 },
      { col: 3, row: 5 }, { col: 6, row: 5 }, { col: 9, row: 5 },
      { col: 4, row: 3 }, { col: 7, row: 3 },
      { col: 4, row: 4 }, { col: 7, row: 4 },
    ],
  },
  {
    id: 'lounge',
    label: 'Lounge',
    icon: '🛋️',
    col: 8, row: 27, w: 16, h: 3,
    color: 'rgba(16,185,129,0.18)',
    targetTiles: [
      { col: 9, row: 28 }, { col: 11, row: 28 }, { col: 13, row: 28 },
      { col: 15, row: 28 }, { col: 17, row: 28 }, { col: 19, row: 28 },
      { col: 21, row: 28 }, { col: 23, row: 28 },
    ],
  },
  {
    id: 'main',
    label: 'Área Central',
    icon: '🏢',
    col: 7, row: 9, w: 14, h: 10,
    color: 'rgba(245,158,11,0.12)',
    targetTiles: [
      { col: 10, row: 12 }, { col: 12, row: 12 }, { col: 14, row: 12 },
      { col: 10, row: 14 }, { col: 12, row: 14 }, { col: 14, row: 14 },
      { col: 10, row: 16 }, { col: 12, row: 16 }, { col: 14, row: 16 },
      { col: 10, row: 18 }, { col: 12, row: 18 },
    ],
  },
]

/** Check if a tile (col, row) is inside any action zone. Returns the zone or null. */
export function getActionZoneAt(col: number, row: number): ActionZone | null {
  for (const zone of ACTION_ZONES) {
    if (col >= zone.col && col < zone.col + zone.w && row >= zone.row && row < zone.row + zone.h) {
      return zone
    }
  }
  return null
}
