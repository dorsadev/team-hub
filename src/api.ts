export type User = {
  id: number
  username: string
  displayName: string
}

export type Branch = {
  id: number
  name: string
  ownerUserId: number
  createdAt: string
}

type UserResponse = { user?: User; error?: string }
type BranchResponse = { branch?: Branch; error?: string }
type BranchesResponse = { branches?: Branch[]; error?: string }

async function parseJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T
  } catch {
    return null
  }
}

// The session cookie is httpOnly, so the browser stores it for us and every
// request just needs to send it along — hence credentials: "include" on all
// calls (they go through the Vite proxy to the backend on :3001).
export async function fetchCurrentUser(): Promise<User | null> {
  try {
    const response = await fetch('/api/me', { credentials: 'include' })
    if (!response.ok) return null
    const data = await parseJson<UserResponse>(response)
    return data?.user ?? null
  } catch {
    // Backend unreachable — treat as signed out; the login form surfaces errors.
    return null
  }
}

export async function login(username: string, password: string): Promise<User> {
  let response: Response
  try {
    response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, password }),
    })
  } catch {
    throw new Error('Unable to reach the server. Please try again.')
  }

  const data = await parseJson<UserResponse>(response)
  if (!response.ok || !data?.user) {
    throw new Error(data?.error ?? 'Unable to sign in. Please try again.')
  }
  return data.user
}

export async function logout(): Promise<void> {
  try {
    await fetch('/api/logout', { method: 'POST', credentials: 'include' })
  } catch {
    // The cookie is cleared server-side; local state is dropped regardless.
  }
}

// Branches are stored in SQLite on the backend; the UI only renders names.
export async function fetchBranches(): Promise<string[]> {
  let response: Response
  try {
    response = await fetch('/api/branches', { credentials: 'include' })
  } catch {
    throw new Error('Unable to reach the server. Please try again.')
  }

  const data = await parseJson<BranchesResponse>(response)
  if (!response.ok) {
    throw new Error(data?.error ?? 'Unable to load branches.')
  }
  return (data?.branches ?? []).map((branch) => branch.name)
}

export async function createBranch(name: string): Promise<string> {
  let response: Response
  try {
    response = await fetch('/api/branches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name }),
    })
  } catch {
    throw new Error('Unable to reach the server. Please try again.')
  }

  const data = await parseJson<BranchResponse>(response)
  if (!response.ok || !data?.branch) {
    throw new Error(data?.error ?? 'Unable to create the branch. Please try again.')
  }
  return data.branch.name
}