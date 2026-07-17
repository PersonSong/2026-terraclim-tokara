import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getStatus, type BlockStatus, type StatusResponse } from '../api'
import { useRoutePrefix } from '../hooks/useRoutePrefix'
import './Dashboard.css'

const DEMO_DATE = '2024-02-15'

// Static demo values — no live weather API for this scaffold.
const DEMO_DATE_LABEL = '17 JUL 2026'
const DEMO_WEATHER_LABEL = '12°C · NW 18 km/h'
const GREETING_NAME = 'André'

const STATUS_ORDER: Record<BlockStatus, number> = {
  irrigate: 0,
  review: 1,
  hold: 2,
}

const STATUS_LABELS: BlockStatus[] = ['irrigate', 'review', 'hold']

function StatusBadge({ status }: { status: BlockStatus }) {
  return (
    <span className={`status-badge status-badge--${status}`}>
      {status.toUpperCase()}
    </span>
  )
}

function formatShortDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00`)
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function Dashboard() {
  const prefix = useRoutePrefix()
  const [blocks, setBlocks] = useState<StatusResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getStatus(DEMO_DATE)
      .then(setBlocks)
      .catch((err: Error) => setError(err.message))
  }, [])

  const sortedBlocks = blocks
    ? [...blocks].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status])
    : null

  const counts = STATUS_LABELS.reduce(
    (acc, status) => {
      acc[status] = blocks?.filter((b) => b.status === status).length ?? 0
      return acc
    },
    {} as Record<BlockStatus, number>,
  )

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="dashboard-header__top">
          <div className="dashboard-header__brand">
            <div className="dashboard-header__mark" aria-hidden="true">T</div>
            <div>
              <p className="dashboard-header__farm-name">Tokara Estate</p>
              <p className="dashboard-header__region">STELLENBOSCH</p>
            </div>
          </div>
          <div className="dashboard-header__meta">
            <p className="dashboard-header__date">{DEMO_DATE_LABEL}</p>
            <p className="dashboard-header__weather">{DEMO_WEATHER_LABEL}</p>
          </div>
        </div>
        <p className="dashboard-header__greeting">
          Good morning, <span className="dashboard-header__greeting-name">{GREETING_NAME}</span> — here
          is your morning status report and recommended actions.
        </p>
      </header>

      <div className="dashboard-content">
        <div className="summary-row">
          {STATUS_LABELS.map((status) => (
            <div key={status} className={`summary-card summary-card--${status}`}>
              <p className="summary-card__count">{counts[status]}</p>
              <p className="summary-card__label">{status.toUpperCase()}</p>
            </div>
          ))}
        </div>

        <h2 className="dashboard-section-title">Today's Priority Blocks</h2>

        {error && <p className="dashboard-status-text">Failed to load status: {error}</p>}
        {!error && !sortedBlocks && <p className="dashboard-status-text">Loading…</p>}
        {!error && sortedBlocks && sortedBlocks.length === 0 && (
          <p className="dashboard-status-text">No blocks reported for {DEMO_DATE}.</p>
        )}

        {sortedBlocks && sortedBlocks.length > 0 && (
          <div className="priority-list">
            {sortedBlocks.map((block) => (
              <Link
                key={block.block_id}
                to={`${prefix}/block/${block.block_id}`}
                className="priority-card"
              >
                <div className="priority-card__top">
                  <div className="priority-card__id-cultivar">
                    <span className="priority-card__id">{block.block_id}</span>
                    <span className="priority-card__cultivar">{block.cultivar}</span>
                  </div>
                  <StatusBadge status={block.status} />
                </div>
                <p className="priority-card__reason">{block.reason}</p>
                <p className="priority-card__meta">
                  Last irrigated {formatShortDate(block.last_irrigated)} · {block.hectares} ha
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>

      <button type="button" className="chat-button" aria-label="Open vineyard assistant">
        🌿
      </button>
    </div>
  )
}

export default Dashboard
