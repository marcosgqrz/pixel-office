import { useState } from 'react'

interface QuickActionBarProps {
  onGatherConference: () => void
  onGatherLounge: () => void
  onGatherMain: () => void
  onReturnToSeats: () => void
  onScatter: () => void
}

const btnBase: React.CSSProperties = {
  padding: '5px 10px',
  fontSize: '20px',
  background: 'var(--pixel-btn-bg)',
  color: 'var(--pixel-text)',
  border: '2px solid transparent',
  borderRadius: 0,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  whiteSpace: 'nowrap',
}

const btnHover: React.CSSProperties = {
  ...btnBase,
  background: 'var(--pixel-btn-hover-bg)',
  border: '2px solid var(--pixel-accent)',
}

export function QuickActionBar({
  onGatherConference,
  onGatherLounge,
  onGatherMain,
  onReturnToSeats,
  onScatter,
}: QuickActionBarProps) {
  const [hovered, setHovered] = useState<string | null>(null)
  const [lastAction, setLastAction] = useState<string | null>(null)

  const trigger = (id: string, fn: () => void) => {
    fn()
    setLastAction(id)
    setTimeout(() => setLastAction(null), 1200)
  }

  const actions = [
    { id: 'conference', icon: '🤝', label: 'Reunião',      fn: onGatherConference },
    { id: 'lounge',     icon: '🛋️', label: 'Lounge',       fn: onGatherLounge     },
    { id: 'main',       icon: '🏢', label: 'Área Central', fn: onGatherMain       },
    { id: 'seats',      icon: '🪑', label: 'Voltar',       fn: onReturnToSeats    },
    { id: 'scatter',    icon: '💨', label: 'Dispersar',    fn: onScatter          },
  ]

  return (
    <div
      style={{
        position: 'absolute',
        top: 8,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 48,
        display: 'flex',
        gap: 4,
        alignItems: 'center',
        background: 'var(--pixel-bg)',
        border: '2px solid var(--pixel-border)',
        borderRadius: 0,
        padding: '4px 8px',
        boxShadow: 'var(--pixel-shadow)',
      }}
    >
      <span style={{ fontSize: '11px', color: 'var(--pixel-text-dim)', marginRight: 4, whiteSpace: 'nowrap' }}>
        Ações:
      </span>
      {actions.map((a) => (
        <button
          key={a.id}
          onClick={() => trigger(a.id, a.fn)}
          onMouseEnter={() => setHovered(a.id)}
          onMouseLeave={() => setHovered(null)}
          style={
            lastAction === a.id
              ? { ...btnBase, background: 'var(--pixel-active-bg)', border: '2px solid var(--pixel-accent)', color: 'var(--pixel-accent)' }
              : hovered === a.id ? btnHover : btnBase
          }
          title={a.label}
        >
          <span>{a.icon}</span>
          <span style={{ fontSize: '11px' }}>{a.label}</span>
        </button>
      ))}
    </div>
  )
}
