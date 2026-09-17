export type UserRole = 'student' | 'admin'

export type User = {
  id: number
  username: string
  displayName: string
  role: UserRole
}

export type Branch = {
  id: number
  name: string
  ownerUserId: number
  createdAt: string
}

type UserResponse = { user?: User; error?: string }
type UsersResponse = { users?: User[]; error?: string }
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

// POST /api/register — creates an account with the role chosen on the signup
// form (no auto-login; the user is sent back to the login screen).
export async function register(input: {
  username: string
  displayName: string
  password: string
  role: UserRole
}): Promise<void> {
  let response: Response
  try {
    response = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(input),
    })
  } catch {
    throw new Error('Unable to reach the server. Please try again.')
  }

  const data = await parseJson<{ error?: string }>(response)
  if (!response.ok) {
    throw new Error(data?.error ?? 'Unable to create the account. Please try again.')
  }
}

// GET /api/users — admin-only member list (username + displayName + role).
export async function fetchUsers(): Promise<User[]> {
  let response: Response
  try {
    response = await fetch('/api/users', { credentials: 'include' })
  } catch {
    throw new Error('Unable to reach the server. Please try again.')
  }

  const data = await parseJson<UsersResponse>(response)
  if (!response.ok) {
    throw new Error(data?.error ?? 'Unable to load members.')
  }
  return data?.users ?? []
}

// GET /api/admin/users/:userId/branches — admin-only view of another user's
// branches (raw snake_case fields, exactly as the backend returns them).
export type AdminUserBranch = {
  id: number
  name: string
  owner_user_id: number
  created_at: string
}

export async function fetchUserBranches(userId: number): Promise<AdminUserBranch[]> {
  let response: Response
  try {
    response = await fetch(`/api/admin/users/${userId}/branches`, {
      credentials: 'include',
    })
  } catch {
    throw new Error('Unable to reach the server. Please try again.')
  }

  const data = await parseJson<{ branches?: AdminUserBranch[]; error?: string }>(response)
  if (!response.ok) {
    throw new Error(data?.error ?? 'Unable to load branches.')
  }
  return data?.branches ?? []
}

// GET /api/admin/users/:userId/branches/:branchId — admin-only details of one
// branch; the backend 404s unless the branch belongs to that user.
export async function fetchBranchDetails(
  userId: number,
  branchId: number,
): Promise<AdminUserBranch> {
  let response: Response
  try {
    response = await fetch(`/api/admin/users/${userId}/branches/${branchId}`, {
      credentials: 'include',
    })
  } catch {
    throw new Error('Unable to reach the server. Please try again.')
  }

  const data = await parseJson<{ branch?: AdminUserBranch; error?: string }>(response)
  if (!response.ok || !data?.branch) {
    throw new Error(data?.error ?? 'Unable to load branch details.')
  }
  return data.branch
}

// GET /api/admin/users/:userId/branches/:branchId/workspace — admin-only
// workspace for one branch (the backend 404s unless the branch belongs to
// that user), including the branch's stored files.
export type AdminBranchFile = {
  id: number
  branch_id: number
  name: string
  content: string
  created_at: string
  updated_at: string
}

export type AdminBranchWorkspace = {
  branch: AdminUserBranch
  files: AdminBranchFile[]
}

export async function fetchBranchWorkspace(
  userId: number,
  branchId: number,
): Promise<AdminBranchWorkspace> {
  let response: Response
  try {
    response = await fetch(
      `/api/admin/users/${userId}/branches/${branchId}/workspace`,
      { credentials: 'include' },
    )
  } catch {
    throw new Error('Unable to reach the server. Please try again.')
  }

  const data = await parseJson<{
    branch?: AdminUserBranch
    files?: AdminBranchFile[]
    error?: string
  }>(response)
  if (!response.ok || !data?.branch) {
    throw new Error(data?.error ?? 'Unable to load the workspace.')
  }
  return { branch: data.branch, files: data.files ?? [] }
}

// GET /api/admin/users/:userId/branches/:branchId/files — admin-only file
// list for one branch (used to refresh after creating a file).
export async function fetchBranchFiles(
  userId: number,
  branchId: number,
): Promise<AdminBranchFile[]> {
  let response: Response
  try {
    response = await fetch(`/api/admin/users/${userId}/branches/${branchId}/files`, {
      credentials: 'include',
    })
  } catch {
    throw new Error('Unable to reach the server. Please try again.')
  }

  const data = await parseJson<{ files?: AdminBranchFile[]; error?: string }>(response)
  if (!response.ok) {
    throw new Error(data?.error ?? 'Unable to load files.')
  }
  return data?.files ?? []
}

// POST /api/admin/users/:userId/branches/:branchId/files — admin-only file
// creation; the backend 404s unless the branch belongs to that user.
export async function createBranchFile(
  userId: number,
  branchId: number,
  input: { name: string; content: string },
): Promise<AdminBranchFile> {
  let response: Response
  try {
    response = await fetch(`/api/admin/users/${userId}/branches/${branchId}/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(input),
    })
  } catch {
    throw new Error('Unable to reach the server. Please try again.')
  }

  const data = await parseJson<{ file?: AdminBranchFile; error?: string }>(response)
  if (!response.ok || !data?.file) {
    throw new Error(data?.error ?? 'Unable to create the file.')
  }
  return data.file
}

// GET /api/admin/users/:userId/branches/:branchId/files/:fileId — admin-only
// single file; the backend 404s unless the file belongs to that branch and
// the branch belongs to that user.
export async function fetchBranchFile(
  userId: number,
  branchId: number,
  fileId: number,
): Promise<AdminBranchFile> {
  let response: Response
  try {
    response = await fetch(
      `/api/admin/users/${userId}/branches/${branchId}/files/${fileId}`,
      { credentials: 'include' },
    )
  } catch {
    throw new Error('Unable to reach the server. Please try again.')
  }

  const data = await parseJson<{ file?: AdminBranchFile; error?: string }>(response)
  if (!response.ok || !data?.file) {
    throw new Error(data?.error ?? 'Unable to load the file.')
  }
  return data.file
}

// PUT /api/admin/users/:userId/branches/:branchId/files/:fileId — admin-only
// update of one file (name and/or content).
export async function updateBranchFile(
  userId: number,
  branchId: number,
  fileId: number,
  input: { name: string; content: string },
): Promise<AdminBranchFile> {
  let response: Response
  try {
    response = await fetch(
      `/api/admin/users/${userId}/branches/${branchId}/files/${fileId}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(input),
      },
    )
  } catch {
    throw new Error('Unable to reach the server. Please try again.')
  }

  const data = await parseJson<{ file?: AdminBranchFile; error?: string }>(response)
  if (!response.ok || !data?.file) {
    throw new Error(data?.error ?? 'Unable to save the file.')
  }
  return data.file
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