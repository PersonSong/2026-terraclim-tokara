import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { getBlockHistory, getStatus, type HistoryResponse } from '../api'
import { DEMO_DATE } from '../constants'
import './Block.css'

function formatShortDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00`)
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function Block() {
  const { blockId } = useParams<{ blockId: string }>()
  const [history, setHistory] = useState<HistoryResponse | null>(null)
  const [phenologyNote, setPhenologyNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!blockId) return
    setHistory(null)
    setError(null)
    Promise.all([getBlockHistory(blockId), getStatus(DEMO_DATE)])
      .then(([historyData, statusData]) => {
        setHistory(historyData)
        const matchingStatus = statusData.find((entry) => entry.block_id === blockId)
        setPhenologyNote(matchingStatus?.phenology_note ?? null)
      })
      .catch((err: Error) => setError(err.message))
  }, [blockId])

  const chartData =
    history?.map((row) => ({
      date: formatShortDate(row.date),
      ETo: row.eto_mm,
      ETa: row.eta_mm,
    })) ?? []

  const latest = history && history.length > 0 ? history[history.length - 1] : null

  return (
    <div className="block-detail">
      <header className="block-detail__header">
        <p className="block-detail__id">{blockId}</p>
        <h1 className="block-detail__cultivar">{latest?.cultivar ?? blockId}</h1>
      </header>

      <div className="block-detail__content">
        {error && <p className="status-text">Failed to load block: {error}</p>}
        {!error && !history && <p className="status-text">Loading…</p>}
        {!error && history && history.length === 0 && (
          <p className="status-text">No history recorded for this block.</p>
        )}

        {history && history.length > 0 && (
          <>
            <h2 className="section-title">ETa vs. ETo</h2>
            <div className="block-detail__chart">
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#d8ceb0" opacity={0.6} />
                  <XAxis dataKey="date" tick={{ fill: '#7a6e5c', fontSize: 10 }} tickLine={false} />
                  <YAxis tick={{ fill: '#7a6e5c', fontSize: 10 }} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      background: '#f5f0e8',
                      border: '1px solid #d8ceb0',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="ETo" stroke="#b83232" strokeWidth={2} dot />
                  <Line type="monotone" dataKey="ETa" stroke="#3d5a3e" strokeWidth={2} dot />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {phenologyNote && (
              <div className="block-detail__note">
                <p className="block-detail__note-label">Phenology Note</p>
                <p className="block-detail__note-text">{phenologyNote}</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default Block
