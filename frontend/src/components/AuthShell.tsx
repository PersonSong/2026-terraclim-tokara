import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import GrapeIcon from './GrapeIcon'
import { useRoutePrefix } from '../hooks/useRoutePrefix'
import './AuthShell.css'

interface AuthShellProps {
  activeTab: 'signin' | 'signup'
  children: ReactNode
}

function AuthShell({ activeTab, children }: AuthShellProps) {
  const prefix = useRoutePrefix()

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-card__brand">
          <div className="auth-card__icon">
            <GrapeIcon size={38} />
          </div>
          <h1 className="auth-card__title">Tokara</h1>
          <p className="auth-card__subtitle">Vineyard Watch</p>
          <p className="auth-card__tagline">
            Daily irrigation decision support for wine farms.
          </p>
        </div>

        <div className="auth-tabs">
          <Link
            to={`${prefix}/login`}
            className={`auth-tab ${activeTab === 'signin' ? 'auth-tab--active' : ''}`}
          >
            Sign In
          </Link>
          <Link
            to={`${prefix}/signup`}
            className={`auth-tab ${activeTab === 'signup' ? 'auth-tab--active' : ''}`}
          >
            Sign Up
          </Link>
        </div>

        {children}

        <p className="auth-card__footer">STELLENBOSCH · WESTERN CAPE · RSA</p>
      </div>
    </div>
  )
}

export default AuthShell
