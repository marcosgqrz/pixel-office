import { useState, useRef, useCallback, useEffect } from 'react'
import { TILE_SIZE } from '../types.js'
import type { RoomLabel } from '../engine/renderer.js'

interface RoomLabelEditorProps {
  labels: RoomLabel[]
  onChange: (labels: RoomLabel[]) => void
  onDone: () => void
  containerRef: React.RefObject<HTMLDivElement | null>
  zoom: number
  panRef: React.RefObject<{ x: number; y: number }>
  layoutCols: number
  layoutRows: number
}

const btnStyle: React.CSSProperties = {
  padding: '5px 12px',
  fontSize: '22px',
  background: 'var(--pixel-bg)',
  color: 'var(--pixel-text)',
  border: '2px solid var(--pixel-border)',
  borderRadius: 0,
  cursor: 'pointer',
}

const iconBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  padding: '0 3px',
  fontSize: '11px',
  lineHeight: 1,
  color: '#94a3b8',
}

const inputStyle: React.CSSProperties = {
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: 4,
  padding: '4px 8px',
  fontSize: '12px',
  color: '#f1f5f9',
  outline: 'none',
}

export function RoomLabelEditor({
  labels,
  onChange,
  onDone,
  containerRef,
  zoom,
  panRef,
  layoutCols,
  layoutRows,
}: RoomLabelEditorProps) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editIcon, setEditIcon] = useState('')
  const [tick, setTick] = useState(0)

  // Re-render every 50ms to track pan changes
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 50)
    return () => clearInterval(id)
  }, [])
  void tick

  // Compute CSS screen position for a label at (col, row)
  const labelPos = (col: number, row: number) => {
    const el = containerRef.current
    if (!el) return { x: 0, y: 0 }
    const rect = el.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    const canvasW = Math.round(rect.width * dpr)
    const canvasH = Math.round(rect.height * dpr)
    const mapW = layoutCols * TILE_SIZE * zoom
    const mapH = layoutRows * TILE_SIZE * zoom
    const deviceOffsetX = Math.floor((canvasW - mapW) / 2) + Math.round(panRef.current.x)
    const deviceOffsetY = Math.floor((canvasH - mapH) / 2) + Math.round(panRef.current.y)
    return {
      x: (deviceOffsetX + col * TILE_SIZE * zoom) / dpr,
      y: (deviceOffsetY + row * TILE_SIZE * zoom) / dpr,
    }
  }

  // Dragging
  const dragRef = useRef<{
    idx: number
    startCol: number
    startRow: number
    startMouseX: number
    startMouseY: number
  } | null>(null)
  const labelsRef = useRef(labels)
  labelsRef.current = labels
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const handleMouseDown = useCallback((e: React.MouseEvent, idx: number) => {
    if (editingIdx !== null) return
    e.preventDefault()
    e.stopPropagation()
    dragRef.current = {
      idx,
      startCol: labelsRef.current[idx].col,
      startRow: labelsRef.current[idx].row,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
    }
  }, [editingIdx])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return
      const dpr = window.devicePixelRatio || 1
      const dx = (e.clientX - dragRef.current.startMouseX) * dpr
      const dy = (e.clientY - dragRef.current.startMouseY) * dpr
      const dCol = dx / (TILE_SIZE * zoom)
      const dRow = dy / (TILE_SIZE * zoom)
      // snap to 0.5 tile increments
      const newCol = Math.round((dragRef.current.startCol + dCol) * 2) / 2
      const newRow = Math.round((dragRef.current.startRow + dRow) * 2) / 2
      const updated = labelsRef.current.map((l, i) =>
        i === dragRef.current!.idx ? { ...l, col: newCol, row: newRow } : l,
      )
      onChangeRef.current(updated)
    }
    const handleMouseUp = () => {
      dragRef.current = null
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [zoom])

  const handleAdd = () => {
    const newLabel: RoomLabel = { name: 'Nova Sala', icon: '🏠', col: layoutCols / 2, row: layoutRows / 2 }
    const idx = labels.length
    onChange([...labels, newLabel])
    setEditingIdx(idx)
    setEditName('Nova Sala')
    setEditIcon('🏠')
  }

  const handleDelete = (idx: number) => {
    onChange(labels.filter((_, i) => i !== idx))
    if (editingIdx === idx) setEditingIdx(null)
  }

  const handleStartEdit = (e: React.MouseEvent, idx: number) => {
    e.stopPropagation()
    setEditingIdx(idx)
    setEditName(labels[idx].name)
    setEditIcon(labels[idx].icon)
  }

  const handleSaveEdit = () => {
    if (editingIdx === null) return
    onChange(labels.map((l, i) => (i === editingIdx ? { ...l, name: editName, icon: editIcon } : l)))
    setEditingIdx(null)
  }

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 50 }}>
      {/* Top bar */}
      <div
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          display: 'flex',
          gap: 4,
          pointerEvents: 'auto',
          zIndex: 55,
        }}
      >
        <button onClick={handleAdd} style={btnStyle} title="Adicionar sala">
          + Sala
        </button>
        <button
          onClick={onDone}
          style={{ ...btnStyle, background: 'var(--pixel-active-bg)', border: '2px solid var(--pixel-accent)', color: 'var(--pixel-accent)' }}
        >
          ✓ Concluído
        </button>
      </div>

      {/* Hint */}
      <div
        style={{
          position: 'absolute',
          top: 14,
          left: '50%',
          transform: 'translateX(-50%)',
          pointerEvents: 'none',
          background: 'rgba(0,0,0,0.75)',
          color: '#94a3b8',
          fontSize: '11px',
          padding: '3px 10px',
          borderRadius: 4,
          whiteSpace: 'nowrap',
          zIndex: 55,
        }}
      >
        Arraste para mover • ✏️ editar • ✕ deletar
      </div>

      {/* Labels */}
      {labels.map((label, idx) => {
        const pos = labelPos(label.col, label.row)
        const isEditing = editingIdx === idx

        return (
          <div
            key={idx}
            style={{
              position: 'absolute',
              left: pos.x,
              top: pos.y,
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'auto',
              zIndex: 51,
            }}
          >
            {/* Pill */}
            <div
              onMouseDown={(e) => handleMouseDown(e, idx)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                background: isEditing ? 'rgba(99,102,241,0.92)' : 'rgba(13,17,23,0.9)',
                border: `2px solid ${isEditing ? '#6366f1' : '#475569'}`,
                borderRadius: 4,
                padding: '4px 8px',
                cursor: dragRef.current?.idx === idx ? 'grabbing' : 'grab',
                userSelect: 'none',
                whiteSpace: 'nowrap',
                boxShadow: '0 2px 10px rgba(0,0,0,0.6)',
              }}
            >
              <span style={{ fontSize: '14px' }}>{label.icon}</span>
              <span style={{ fontSize: '11px', color: '#e2e8f0', fontFamily: 'monospace' }}>{label.name}</span>
              <button
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => handleStartEdit(e, idx)}
                style={{ ...iconBtnStyle, color: '#93c5fd' }}
                title="Editar"
              >
                ✏️
              </button>
              <button
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); handleDelete(idx) }}
                style={{ ...iconBtnStyle, color: '#f87171' }}
                title="Deletar"
              >
                ✕
              </button>
            </div>

            {/* Inline edit popover */}
            {isEditing && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: '#0d1117',
                  border: '2px solid #6366f1',
                  borderRadius: 6,
                  padding: '10px',
                  zIndex: 60,
                  boxShadow: '0 4px 20px rgba(0,0,0,0.7)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  minWidth: 200,
                }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    value={editIcon}
                    onChange={(e) => setEditIcon(e.target.value)}
                    style={{ ...inputStyle, width: 40, textAlign: 'center', fontSize: '16px' }}
                    placeholder="🏠"
                    maxLength={4}
                    title="Emoji"
                  />
                  <input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveEdit()
                      if (e.key === 'Escape') setEditingIdx(null)
                    }}
                    style={{ ...inputStyle, flex: 1 }}
                    placeholder="Nome da sala"
                  />
                </div>
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => setEditingIdx(null)}
                    style={{ padding: '4px 10px', fontSize: '11px', background: 'transparent', color: '#94a3b8', border: '1px solid #334155', borderRadius: 4, cursor: 'pointer' }}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSaveEdit}
                    style={{ padding: '4px 10px', fontSize: '11px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                  >
                    Salvar
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
