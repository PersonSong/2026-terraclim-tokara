import { useState, type SubmitEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import AuthShell from '../components/AuthShell'
import { useRoutePrefix } from '../hooks/useRoutePrefix'

const VARIETIES = [
  'Cabernet Sauvignon',
  'Chardonnay',
  'Sauvignon Blanc',
  'Merlot',
  'Shiraz',
  'Pinotage',
  'Chenin Blanc',
  'Semillon',
  'Petit Verdot',
]

function Signup() {
  const navigate = useNavigate()
  const prefix = useRoutePrefix()
  const [farmName, setFarmName] = useState('')
  const [contactName, setContactName] = useState('')
  const [region, setRegion] = useState('')
  const [numBlocks, setNumBlocks] = useState('')
  const [selectedVarieties, setSelectedVarieties] = useState<string[]>([])

  function toggleVariety(variety: string) {
    setSelectedVarieties((prev) =>
      prev.includes(variety) ? prev.filter((v) => v !== variety) : [...prev, variety],
    )
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault()
    // No real auth yet — any submission drops straight into the mock dashboard.
    navigate(`${prefix}/dashboard`)
  }

  return (
    <AuthShell activeTab="signup">
      <form className="auth-form" onSubmit={handleSubmit}>
        <p className="auth-intro">
          Register your farm to access daily irrigation recommendations, block
          monitoring, and ETa/ETo analytics.
        </p>

        <div className="auth-field">
          <label htmlFor="signup-farm-name">Farm Name</label>
          <input
            id="signup-farm-name"
            type="text"
            value={farmName}
            onChange={(e) => setFarmName(e.target.value)}
            placeholder="e.g. Tokara Estate"
          />
        </div>

        <div className="auth-field">
          <label htmlFor="signup-contact-name">Contact Name</label>
          <input
            id="signup-contact-name"
            type="text"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            placeholder="e.g. André van der Berg"
          />
        </div>

        <div className="auth-field">
          <label htmlFor="signup-region">Region / Location</label>
          <input
            id="signup-region"
            type="text"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            placeholder="e.g. Stellenbosch, Western Cape"
          />
        </div>

        <div className="auth-field">
          <label htmlFor="signup-num-blocks">Number of Vineyard Blocks</label>
          <input
            id="signup-num-blocks"
            type="number"
            value={numBlocks}
            onChange={(e) => setNumBlocks(e.target.value)}
            placeholder="e.g. 9"
          />
        </div>

        <div className="auth-field">
          <label>Primary Grape Varieties</label>
          <p className="auth-hint">Select all that apply</p>
          <div className="variety-chips">
            {VARIETIES.map((variety) => (
              <button
                key={variety}
                type="button"
                className={`variety-chip ${
                  selectedVarieties.includes(variety) ? 'variety-chip--active' : ''
                }`}
                onClick={() => toggleVariety(variety)}
              >
                {variety}
              </button>
            ))}
          </div>
        </div>

        <button type="submit" className="auth-submit auth-submit--accent">
          Create Account
        </button>

        <p className="auth-hint auth-hint--centered">
          Demo data will be loaded to illustrate your dashboard
        </p>
      </form>
    </AuthShell>
  )
}

export default Signup
