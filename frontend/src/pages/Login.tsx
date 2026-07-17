import { useState, type SubmitEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthShell from '../components/AuthShell'
import { useRoutePrefix } from '../hooks/useRoutePrefix'

function Login() {
  const navigate = useNavigate()
  const prefix = useRoutePrefix()
  const [email, setEmail] = useState('andre@tokara.co.za')
  const [password, setPassword] = useState('vineyard2026')
  const [showPassword, setShowPassword] = useState(false)

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault()
    // No real auth yet — any submission drops straight into the mock dashboard.
    navigate(`${prefix}/dashboard`)
  }

  return (
    <AuthShell activeTab="signin">
      <form className="auth-form" onSubmit={handleSubmit}>
        <div className="auth-field">
          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="auth-field">
          <label htmlFor="login-password">Password</label>
          <div className="auth-password-wrapper">
            <input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="auth-password-toggle"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? '🙈' : '👁'}
            </button>
          </div>
        </div>

        <button type="button" className="auth-forgot">
          Forgot password?
        </button>

        <button type="submit" className="auth-submit">
          Sign In
        </button>

        <div className="auth-divider">
          <span className="auth-divider__line" />
          <span className="auth-divider__text">OR</span>
          <span className="auth-divider__line" />
        </div>

        <p className="auth-switch-text">
          New farm? <Link to={`${prefix}/signup`}>Register here</Link>
        </p>
      </form>
    </AuthShell>
  )
}

export default Login
