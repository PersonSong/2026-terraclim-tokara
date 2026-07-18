import { useEffect, useState } from 'react'
import { getStatus, type BlockStatus, type StatusResponse } from '../api'
import { DEMO_DATE } from '../constants'
import {
  buildFarmNarrative,
  getBlockIndicators,
  getRecommendation,
  sortByDepletionDescending,
} from '../lib/farmReport'
import VineyardMap from '../components/VineyardMap'
import ChatWidget from '../components/ChatWidget'
import './Dashboard.css'

// Static placeholder — no live weather API integrated. Chosen to be
// seasonally plausible for Stellenbosch in December (Southern Hemisphere
// summer), not an actual forecast.
const DEMO_WEATHER_LABEL = '24°C · SE 15 km/h'
const GREETING_NAME = 'André'

const STATUS_LABELS: BlockStatus[] = ['irrigate', 'review', 'hold']

function formatHeaderDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00`)
  return date
    .toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    .replace(/[  ]/g, ' ') // normalize non-breaking spaces some locales insert
    .toUpperCase()
}

function Dashboard() {
  const [blocks, setBlocks] = useState<StatusResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expandedStatus, setExpandedStatus] = useState<BlockStatus | null>(null)

  useEffect(() => {
    getStatus(DEMO_DATE)
      .then(setBlocks)
      .catch((err: Error) => setError(err.message))
  }, [])

  const counts = STATUS_LABELS.reduce(
    (acc, status) => {
      acc[status] = blocks?.filter((b) => b.status === status).length ?? 0
      return acc
    },
    {} as Record<BlockStatus, number>,
  )

  const narrative = blocks ? buildFarmNarrative(blocks) : null
  const expandedBlocks =
    blocks && expandedStatus
      ? sortByDepletionDescending(blocks.filter((b) => b.status === expandedStatus))
      : []

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
            <p className="dashboard-header__date">{formatHeaderDate(DEMO_DATE)}</p>
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
            <button
              key={status}
              type="button"
              className={`summary-card summary-card--${status} ${
                expandedStatus === status ? 'summary-card--active' : ''
              }`}
              aria-pressed={expandedStatus === status}
              onClick={() => setExpandedStatus((prev) => (prev === status ? null : status))}
            >
              <p className="summary-card__count">{counts[status]}</p>
              <p className="summary-card__label">{status.toUpperCase()}</p>
            </button>
          ))}
        </div>

        <section className="farm-report">
          <h2 className="section-title">Farm Status Report</h2>

          {error && <p className="status-text">Failed to load status: {error}</p>}
          {!error && !blocks && <p className="status-text">Loading…</p>}
          {!error && narrative && <p className="farm-report__narrative">{narrative.text}</p>}

          {expandedStatus && expandedBlocks.length > 0 && (
            <div className="farm-report__expanded">
              {expandedBlocks.map((block) => {
                const indicators = getBlockIndicators(block)
                const recommendation = getRecommendation(block, indicators)
                return (
                  <div key={block.block_id} className="farm-report__block">
                    <div className="farm-report__block-header">
                      <span className="farm-report__block-id">{block.block_id}</span>
                      <span className="farm-report__block-cultivar">{block.cultivar}</span>
                    </div>

                    <ul className="farm-report__indicators">
                      {indicators.map((indicator) => (
                        <li key={indicator.label}>
                          <span className="farm-report__indicator-label">{indicator.label}:</span>{' '}
                          <span className="farm-report__indicator-value">{indicator.value}</span>
                          {' — '}
                          {indicator.interpretation}
                        </li>
                      ))}
                    </ul>

                    <div className="farm-report__recommendation">
                      <p className="farm-report__recommendation-action">
                        Recommended action: {recommendation.action}
                      </p>
                      <p className="farm-report__recommendation-why">{recommendation.why}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        <VineyardMap date={DEMO_DATE} />
      </div>

      <ChatWidget date={DEMO_DATE} />
    </div>
  )
}

export default Dashboard
