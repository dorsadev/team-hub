import { useState, type ChangeEvent, type FormEvent } from 'react'
import { register } from './api'

type SignupProps = {
  onRegistered: (username: string) => void
  onSwitchToLogin: () => void
}

function Signup({ onRegistered, onSwitchToLogin }: SignupProps) {
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isRegistered, setIsRegistered] = useState(false)

  const handleDisplayNameChange = (event: ChangeEvent<HTMLInputElement>) => {
    setDisplayName(event.target.value)
    setError('')
  }

  const handleUsernameChange = (event: ChangeEvent<HTMLInputElement>) => {
    setUsername(event.target.value)
    setError('')
  }

  const handlePasswordChange = (event: ChangeEvent<HTMLInputElement>) => {
    setPassword(event.target.value)
    setError('')
  }

  const handleConfirmPasswordChange = (event: ChangeEvent<HTMLInputElement>) => {
    setConfirmPassword(event.target.value)
    setError('')
  }

  const handleRoleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setIsAdmin(event.target.checked)
    setError('')
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isSubmitting) return

    const name = displayName.trim()
    const trimmedUsername = username.trim()
    if (!name || !trimmedUsername || !password || !confirmPassword) {
      setError('All fields are required.')
      return
    }
    if (trimmedUsername.length < 3) {
      setError('Username must be at least 3 characters.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setIsSubmitting(true)
    setError('')
    register({
      username: trimmedUsername,
      displayName: name,
      password,
      role: isAdmin ? 'admin' : 'student',
    })
      .then(() => {
        onRegistered(trimmedUsername)
        setIsRegistered(true)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Unable to create the account.')
      })
      .finally(() => setIsSubmitting(false))
  }

  if (isRegistered) {
    return (
      <div className="login-page">
        <section className="login-card">
          <h1>Team Hub</h1>
          <p className="login-subtitle">Account created 🎉</p>
          <p className="login-switch">
            Welcome, {displayName.trim()}! You can now sign in.
          </p>
          <div className="login-actions">
            <button
              type="button"
              className="action action-primary"
              onClick={onSwitchToLogin}
            >
              Go to Login
            </button>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="login-page">
      <section className="login-card">
        <h1>Team Hub</h1>
        <p className="login-subtitle">Create your account</p>

        <form className="login-form" onSubmit={handleSubmit}>
          <label className="login-label" htmlFor="signup-name">
            Full Name
          </label>
          <input
            id="signup-name"
            className="login-input"
            type="text"
            value={displayName}
            onChange={handleDisplayNameChange}
            placeholder="e.g. Dorsa"
            autoComplete="name"
            autoFocus
          />

          <label className="login-label" htmlFor="signup-username">
            Username
          </label>
          <input
            id="signup-username"
            className="login-input"
            type="text"
            value={username}
            onChange={handleUsernameChange}
            placeholder="e.g. dorsadev"
            autoComplete="username"
          />

          <label className="login-label" htmlFor="signup-password">
            Password
          </label>
          <input
            id="signup-password"
            className="login-input"
            type="password"
            value={password}
            onChange={handlePasswordChange}
            autoComplete="new-password"
          />

          <label className="login-label" htmlFor="signup-confirm">
            Confirm Password
          </label>
          <input
            id="signup-confirm"
            className="login-input"
            type="password"
            value={confirmPassword}
            onChange={handleConfirmPasswordChange}
            autoComplete="new-password"
          />

          <div className="signup-role">
            <input
              id="signup-admin"
              type="checkbox"
              checked={isAdmin}
              onChange={handleRoleChange}
            />
            <label htmlFor="signup-admin">I am a admin</label>
          </div>

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
              {isSubmitting ? 'Creating account…' : 'Create Account'}
            </button>
          </div>
        </form>

        <p className="login-switch">
          Already have an account?{' '}
          <button type="button" onClick={onSwitchToLogin}>
            Sign in
          </button>
        </p>
      </section>
    </div>
  )
}

export default Signup