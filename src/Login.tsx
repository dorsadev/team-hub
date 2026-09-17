import { useState, type ChangeEvent, type FormEvent } from 'react'
import { login, type User } from './api'

type LoginProps = {
  onLoggedIn: (user: User) => void
  onSwitchToSignup: () => void
  initialUsername?: string
}

function Login({ onLoggedIn, onSwitchToSignup, initialUsername = '' }: LoginProps) {
  const [username, setUsername] = useState(initialUsername)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleUsernameChange = (event: ChangeEvent<HTMLInputElement>) => {
    setUsername(event.target.value)
    setError('')
  }

  const handlePasswordChange = (event: ChangeEvent<HTMLInputElement>) => {
    setPassword(event.target.value)
    setError('')
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isSubmitting) return

    setIsSubmitting(true)
    setError('')
    login(username.trim(), password)
      .then(onLoggedIn)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Unable to sign in.')
      })
      .finally(() => setIsSubmitting(false))
  }

  return (
    <div className="login-page">
      <section className="login-card">
        <h1>Team Hub</h1>
        <p className="login-subtitle">Sign in to your account</p>

        <form className="login-form" onSubmit={handleSubmit}>
          <label className="login-label" htmlFor="login-username">
            Username
          </label>
          <input
            id="login-username"
            className="login-input"
            type="text"
            value={username}
            onChange={handleUsernameChange}
            placeholder="dorsadev"
            autoComplete="username"
            autoFocus
          />

          <label className="login-label" htmlFor="login-password">
            Password
          </label>
          <input
            id="login-password"
            className="login-input"
            type="password"
            value={password}
            onChange={handlePasswordChange}
            autoComplete="current-password"
          />

          {error && (
            <p className="login-error" role="alert">
              {error}
            </p>
          )}

          <div className="login-actions">
            <button
              type="submit"
              className="action action-primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Signing in…' : 'Sign in'}
            </button>
          </div>
        </form>

        <p className="login-switch">
          New to Team Hub?{' '}
          <button type="button" onClick={onSwitchToSignup}>
            Create an account
          </button>
        </p>
      </section>
    </div>
  )
}

export default Login