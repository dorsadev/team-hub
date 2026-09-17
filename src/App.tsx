import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import './App.css'

function App() {
  const [branches, setBranches] = useState(['main'])
  const [activeBranch, setActiveBranch] = useState('main')
  const [activities, setActivities] = useState([
    'Dorsa created branch “main”',
    'Dorsa opened the workspace',
  ])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isWorkspaceOpen, setIsWorkspaceOpen] = useState(false)
  const [branchName, setBranchName] = useState('')
  const [error, setError] = useState('')

  const openModal = () => {
    setBranchName('')
    setError('')
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setBranchName('')
    setError('')
    setIsModalOpen(false)
  }

  const openWorkspace = () => setIsWorkspaceOpen(true)

  const closeWorkspace = () => setIsWorkspaceOpen(false)

  const handleBranchNameChange = (event: ChangeEvent<HTMLInputElement>) => {
    setBranchName(event.target.value)
    setError('')
  }

  const createBranch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const name = branchName.trim()
    if (!name) {
      setError('Enter a branch name.')
      return
    }
    if (branches.includes(name)) {
      setError('That branch already exists.')
      return
    }

    setBranches([...branches, name])
    setActivities([`Dorsa created branch “${name}”`, ...activities])
    closeModal()
  }

  useEffect(() => {
    if (!isModalOpen && !isWorkspaceOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (isModalOpen) closeModal()
      else closeWorkspace()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isModalOpen, isWorkspaceOpen])

  const stats = [
    { label: 'Total Branches', value: branches.length },
    { label: 'Active Branches', value: activeBranch ? 1 : 0 },
    { label: 'Open PRs', value: 0 },
  ]

  return (
    <div className="app">
      <header className="header">
        <h1>Team Hub</h1>
      </header>

      <main className="main">
        <p className="welcome">Welcome back, Dorsa!</p>

        <section className="section">
          <h2>Quick Actions</h2>
          <div className="actions">
            <button
              type="button"
              className="action action-primary"
              onClick={openModal}
            >
              + New Branch
            </button>
            <button type="button" className="action" onClick={openWorkspace}>
              Open Workspace
            </button>
            <button type="button" className="action">
              View Activity
            </button>
          </div>
        </section>

        <div className="grid">
          <section className="card">
            <h2>My Workspace</h2>
            <p className="empty-state">Nothing here yet.</p>
          </section>
        </div>

        <section className="section">
          <h2>My Branches</h2>
          {branches.length > 0 ? (
            <ul className="branches">
              {branches.map((branch) => {
                const isActive = branch === activeBranch

                return (
                  <li key={branch}>
                    <button
                      type="button"
                      className={isActive ? 'branch branch-active' : 'branch'}
                      onClick={() => setActiveBranch(branch)}
                      aria-pressed={isActive}
                    >
                      <span className="branch-dot" aria-hidden="true"></span>
                      <span className="branch-name">{branch}</span>
                      {isActive && <span className="branch-badge">Active</span>}
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="empty-state">No branches yet</p>
          )}
        </section>

        <section className="section">
          <h2>Project Overview</h2>
          <div className="stats">
            {stats.map((stat) => (
              <div className="stat" key={stat.label}>
                <p className="stat-value">{stat.value}</p>
                <p className="stat-label">{stat.label}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="section">
          <h2>Recent Activity</h2>
          {activities.length > 0 ? (
            <ul className="activities">
              {activities.map((activity) => (
                <li className="activity" key={activity}>
                  <span className="activity-dot" aria-hidden="true"></span>
                  {activity}
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-state">No recent activity</p>
          )}
        </section>
      </main>

      {isModalOpen && (
        <div className="overlay">
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-branch-title"
          >
            <h2 id="create-branch-title">Create New Branch</h2>

            <form className="modal-form" onSubmit={createBranch}>
              <label className="modal-label" htmlFor="branch-name">
                Branch name
              </label>
              <input
                id="branch-name"
                className="modal-input"
                type="text"
                value={branchName}
                onChange={handleBranchNameChange}
                placeholder="e.g. feature/login"
                autoFocus
              />
              {error && <p className="modal-error">{error}</p>}

              <div className="modal-actions">
                <button type="button" className="action" onClick={closeModal}>
                  Cancel
                </button>
                <button type="submit" className="action action-primary">
                  Create Branch
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isWorkspaceOpen && (
        <div className="overlay">
          <div
            className="workspace-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="workspace-title"
          >
            <h2 id="workspace-title">My Workspace</h2>

            <dl className="workspace-details">
              <div className="workspace-row">
                <dt className="workspace-label">Owner</dt>
                <dd className="workspace-value">Dorsa</dd>
              </div>
              <div className="workspace-row">
                <dt className="workspace-label">Status</dt>
                <dd className="workspace-value workspace-status">
                  <span className="workspace-dot" aria-hidden="true"></span>
                  Online
                </dd>
              </div>
            </dl>

            <div className="workspace-actions">
              <button
                type="button"
                className="action action-primary"
                onClick={closeWorkspace}
              >
                Close Workspace
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
