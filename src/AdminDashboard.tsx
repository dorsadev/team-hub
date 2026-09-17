import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { createBranchFile, fetchBranchFile, fetchBranchFiles, fetchBranchWorkspace, fetchUserBranches, fetchUsers, updateBranchFile, type AdminBranchFile, type AdminBranchWorkspace, type AdminUserBranch, type User } from './api'

type AdminDashboardProps = {
  user: User
  onLogout: () => void
}

function AdminDashboard({ user, onLogout }: AdminDashboardProps) {
  const [members, setMembers] = useState<User[]>([])
  const [isLoadingMembers, setIsLoadingMembers] = useState(true)
  const [membersError, setMembersError] = useState('')
  // Id of the clicked student; the panel below the list reflects it.
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null)

  const selectedMember =
    members.find((member) => member.id === selectedUserId) ?? null

  // Branches of the selected student, fetched when the selection changes.
  const [selectedBranches, setSelectedBranches] = useState<AdminUserBranch[] | null>(null)
  const [isLoadingBranches, setIsLoadingBranches] = useState(false)
  const [branchesError, setBranchesError] = useState('')
  // Id of the clicked branch within the selected student's list.
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(null)
  // Workspace of the selected branch, fetched when the selection changes.
  const [workspace, setWorkspace] = useState<AdminBranchWorkspace | null>(null)
  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(false)
  const [workspaceError, setWorkspaceError] = useState('')
  // Files of the selected branch: loaded with the workspace, refreshed after
  // creating a file.
  const [files, setFiles] = useState<AdminBranchFile[] | null>(null)
  // Tracks the current branch so a slow file create can't apply elsewhere.
  const selectedBranchIdRef = useRef<number | null>(null)
  // "New File" form state.
  const [showFileForm, setShowFileForm] = useState(false)
  const [fileName, setFileName] = useState('')
  const [fileContent, setFileContent] = useState('')
  const [fileFormError, setFileFormError] = useState('')
  const [isCreatingFile, setIsCreatingFile] = useState(false)
  // Selected file in the workspace, opened in the editor below the list.
  const [selectedFileId, setSelectedFileId] = useState<number | null>(null)
  const selectedFileIdRef = useRef<number | null>(null)
  const [fileDetails, setFileDetails] = useState<AdminBranchFile | null>(null)
  const [isLoadingFile, setIsLoadingFile] = useState(false)
  const [fileError, setFileError] = useState('')
  // Editor draft state (kept separate so Cancel can restore the loaded file).
  const [editName, setEditName] = useState('')
  const [editContent, setEditContent] = useState('')
  const [saveError, setSaveError] = useState('')
  const [isSavingFile, setIsSavingFile] = useState(false)

  const selectedBranch =
    selectedBranches?.find((branch) => branch.id === selectedBranchId) ?? null

  // State resets happen here (not in an effect) so re-selecting is clean.
  const handleSelectStudent = (id: number) => {
    if (id === selectedUserId) return
    setSelectedUserId(id)
    setSelectedBranches(null)
    setBranchesError('')
    setIsLoadingBranches(true)
    setSelectedBranchId(null)
    selectedBranchIdRef.current = null
    setWorkspace(null)
    setWorkspaceError('')
    setIsLoadingWorkspace(false)
    setFiles(null)
    setShowFileForm(false)
    setFileName('')
    setFileContent('')
    setFileFormError('')
    setIsCreatingFile(false)
    setSelectedFileId(null)
    selectedFileIdRef.current = null
    setFileDetails(null)
    setFileError('')
    setIsLoadingFile(false)
    setEditName('')
    setEditContent('')
    setSaveError('')
    setIsSavingFile(false)
  }

  const handleSelectBranch = (id: number) => {
    if (id === selectedBranchId) return
    setSelectedBranchId(id)
    selectedBranchIdRef.current = id
    setWorkspace(null)
    setWorkspaceError('')
    setIsLoadingWorkspace(true)
    setFiles(null)
    setShowFileForm(false)
    setFileName('')
    setFileContent('')
    setFileFormError('')
    setIsCreatingFile(false)
    setSelectedFileId(null)
    selectedFileIdRef.current = null
    setFileDetails(null)
    setFileError('')
    setIsLoadingFile(false)
    setEditName('')
    setEditContent('')
    setSaveError('')
    setIsSavingFile(false)
  }

  const handleOpenFileForm = () => {
    setFileName('')
    setFileContent('')
    setFileFormError('')
    setShowFileForm(true)
  }

  const handleCancelFileForm = () => {
    setShowFileForm(false)
    setFileName('')
    setFileContent('')
    setFileFormError('')
  }

  const handleFileNameChange = (event: ChangeEvent<HTMLInputElement>) => {
    setFileName(event.target.value)
    setFileFormError('')
  }

  const handleFileContentChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setFileContent(event.target.value)
    setFileFormError('')
  }

  const handleCreateFile = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isCreatingFile) return
    if (selectedUserId === null || selectedBranchId === null) return

    const name = fileName.trim()
    if (!name) {
      setFileFormError('Enter a file name.')
      return
    }

    setIsCreatingFile(true)
    setFileFormError('')
    const userId = selectedUserId
    const branchId = selectedBranchId
    createBranchFile(userId, branchId, { name, content: fileContent })
      .then(() => fetchBranchFiles(userId, branchId))
      .then((nextFiles) => {
        // Ignore the refresh if the admin moved to another branch meanwhile.
        if (selectedBranchIdRef.current === branchId) {
          setFiles(nextFiles)
          setShowFileForm(false)
          setFileName('')
          setFileContent('')
        }
      })
      .catch((err: unknown) => {
        setFileFormError(
          err instanceof Error ? err.message : 'Unable to create the file.',
        )
      })
      .finally(() => {
        setIsCreatingFile(false)
      })
  }

  const handleSelectFile = (id: number) => {
    if (id === selectedFileId) return
    setSelectedFileId(id)
    selectedFileIdRef.current = id
    setFileDetails(null)
    setFileError('')
    setIsLoadingFile(true)
    setEditName('')
    setEditContent('')
    setSaveError('')
  }

  const handleEditNameChange = (event: ChangeEvent<HTMLInputElement>) => {
    setEditName(event.target.value)
    setSaveError('')
  }

  const handleEditContentChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setEditContent(event.target.value)
    setSaveError('')
  }

  const handleCancelEdit = () => {
    // Discard unsaved edits and restore the loaded file.
    if (fileDetails !== null) {
      setEditName(fileDetails.name)
      setEditContent(fileDetails.content)
    }
    setSaveError('')
  }

  const handleSaveFile = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isSavingFile) return
    if (selectedUserId === null || selectedBranchId === null || selectedFileId === null) return

    const name = editName.trim()
    if (!name) {
      setSaveError('Enter a file name.')
      return
    }

    setIsSavingFile(true)
    setSaveError('')
    const userId = selectedUserId
    const branchId = selectedBranchId
    const fileId = selectedFileId
    updateBranchFile(userId, branchId, fileId, { name, content: editContent })
      .then((updatedFile) => {
        // Ignore the result if the admin moved to another branch/file meanwhile.
        if (selectedFileIdRef.current !== fileId || selectedBranchIdRef.current !== branchId) return
        setFileDetails(updatedFile)
        setEditName(updatedFile.name)
        setEditContent(updatedFile.content)
        return fetchBranchFiles(userId, branchId)
      })
      .then((nextFiles) => {
        if (nextFiles && selectedFileIdRef.current === fileId) {
          setFiles(nextFiles)
        }
      })
      .catch((err: unknown) => {
        setSaveError(
          err instanceof Error ? err.message : 'Unable to save the file.',
        )
      })
      .finally(() => {
        setIsSavingFile(false)
      })
  }

  useEffect(() => {
    if (selectedUserId === null) return

    let cancelled = false
    fetchUserBranches(selectedUserId)
      .then((branches) => {
        if (!cancelled) setSelectedBranches(branches)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setBranchesError(
            err instanceof Error ? err.message : 'Unable to load branches.',
          )
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingBranches(false)
      })

    return () => {
      cancelled = true
    }
  }, [selectedUserId])

  // Workspace for the selected branch, fetched when the selection changes.
  useEffect(() => {
    if (selectedBranchId === null || selectedUserId === null) return

    let cancelled = false
    fetchBranchWorkspace(selectedUserId, selectedBranchId)
      .then((nextWorkspace) => {
        if (!cancelled) {
          setWorkspace(nextWorkspace)
          setFiles(nextWorkspace.files)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setWorkspaceError(
            err instanceof Error ? err.message : 'Unable to load the workspace.',
          )
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingWorkspace(false)
      })

    return () => {
      cancelled = true
    }
  }, [selectedBranchId, selectedUserId])

  // The selected file, fetched when the selection changes.
  useEffect(() => {
    if (selectedFileId === null || selectedBranchId === null || selectedUserId === null) return

    let cancelled = false
    fetchBranchFile(selectedUserId, selectedBranchId, selectedFileId)
      .then((file) => {
        if (!cancelled) {
          setFileDetails(file)
          setEditName(file.name)
          setEditContent(file.content)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setFileError(
            err instanceof Error ? err.message : 'Unable to load the file.',
          )
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingFile(false)
      })

    return () => {
      cancelled = true
    }
  }, [selectedFileId, selectedBranchId, selectedUserId])

  // Members come from the backend (GET /api/users) — nothing is hardcoded.
  useEffect(() => {
    let cancelled = false
    fetchUsers()
      .then((nextMembers) => {
        if (!cancelled) setMembers(nextMembers)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setMembersError(
            err instanceof Error ? err.message : 'Unable to load members.',
          )
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingMembers(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <h1>Team Hub</h1>
          <button type="button" className="action" onClick={onLogout}>
            Log out
          </button>
        </div>
      </header>

      <main className="main">
        <p className="welcome">Welcome back, {user.displayName}!</p>

        <section className="section">
          <h2>Admin Dashboard</h2>
          <p className="empty-state">
            You can see every member of the hub below.
          </p>
        </section>

        <section className="section">
          <h2>Team Members</h2>
          {isLoadingMembers ? (
            <p className="empty-state">Loading members…</p>
          ) : membersError ? (
            <p className="empty-state">{membersError}</p>
          ) : members.length > 0 ? (
            <ul className="admin-list">
              {members.map((member) => {
                const row = (
                  <>
                    <div className="admin-user-info">
                      <p className="admin-user-name">{member.displayName}</p>
                      <p className="admin-user-username">@{member.username}</p>
                    </div>
                    <span className={`admin-role admin-role-${member.role}`}>
                      {member.role === 'admin' ? 'Admin' : 'Student'}
                    </span>
                  </>
                )
                return (
                  <li className="admin-user" key={member.id}>
                    {member.role === 'student' ? (
                      <button
                        type="button"
                        className={`admin-user-click${
                          member.id === selectedUserId ? ' admin-user-selected' : ''
                        }`}
                        onClick={() => handleSelectStudent(member.id)}
                      >
                        {row}
                      </button>
                    ) : (
                      <div className="admin-user-click">{row}</div>
                    )}
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="empty-state">No members yet</p>
          )}

          {selectedMember !== null && (
            <div className="admin-selected" role="status">
              <p className="admin-selected-title">
                Selected user: {selectedMember.displayName}
              </p>
              {isLoadingBranches ? (
                <p className="admin-selected-status">Loading branches…</p>
              ) : branchesError ? (
                <p className="admin-selected-status admin-selected-error">
                  {branchesError}
                </p>
              ) : selectedBranches !== null && selectedBranches.length > 0 ? (
                <ul className="admin-selected-branch-list">
                  {selectedBranches.map((branch) => (
                    <li key={branch.id}>
                      <button
                        type="button"
                        className={`admin-branch-click${
                          branch.id === selectedBranchId ? ' admin-branch-selected' : ''
                        }`}
                        onClick={() => handleSelectBranch(branch.id)}
                      >
                        {branch.name}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="admin-selected-status">No branches</p>
              )}

              {selectedBranch !== null && (
                <div className="admin-selected-branch" role="status">
                  <p className="admin-selected-branch-title">
                    Selected branch: {selectedBranch.name}
                  </p>

                  <div className="admin-workspace">
                    <div className="admin-workspace-head">
                      <p className="admin-workspace-title">Workspace</p>
                      {!showFileForm && (
                        <button
                          type="button"
                          className="action admin-new-file-btn"
                          onClick={handleOpenFileForm}
                        >
                          + New File
                        </button>
                      )}
                    </div>
                    {isLoadingWorkspace ? (
                      <p className="admin-workspace-status">Loading workspace…</p>
                    ) : workspaceError ? (
                      <p className="admin-workspace-status admin-workspace-error">
                        {workspaceError}
                      </p>
                    ) : workspace !== null ? (
                      <>
                        <p className="admin-workspace-branch">
                          Branch: {workspace.branch.name}
                        </p>

                        {showFileForm && (
                          <form className="admin-file-form" onSubmit={handleCreateFile}>
                            <label className="admin-file-label" htmlFor="admin-file-name">
                              File name
                            </label>
                            <input
                              id="admin-file-name"
                              className="admin-file-input"
                              type="text"
                              value={fileName}
                              onChange={handleFileNameChange}
                              placeholder="e.g. index.js"
                              autoFocus
                            />

                            <label className="admin-file-label" htmlFor="admin-file-content">
                              Content
                            </label>
                            <textarea
                              id="admin-file-content"
                              className="admin-file-input admin-file-textarea"
                              value={fileContent}
                              onChange={handleFileContentChange}
                              placeholder="File content (optional)"
                              rows={4}
                            />

                            {fileFormError && (
                              <p className="admin-workspace-error" role="alert">
                                {fileFormError}
                              </p>
                            )}

                            <div className="admin-file-actions">
                              <button
                                type="button"
                                className="action"
                                onClick={handleCancelFileForm}
                              >
                                Cancel
                              </button>
                              <button
                                type="submit"
                                className="action action-primary"
                                disabled={isCreatingFile}
                              >
                                {isCreatingFile ? 'Creating…' : 'Create File'}
                              </button>
                            </div>
                          </form>
                        )}

                        {files === null ? (
                          <p className="admin-workspace-status">Loading files…</p>
                        ) : files.length > 0 ? (
                          <ul className="admin-workspace-files">
                            {files.map((file) => (
                              <li key={file.id}>
                                <button
                                  type="button"
                                  className={`admin-file-click${
                                    file.id === selectedFileId ? ' admin-file-selected' : ''
                                  }`}
                                  onClick={() => handleSelectFile(file.id)}
                                >
                                  {file.name}
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="admin-workspace-status">No files yet</p>
                        )}

                        {selectedFileId !== null && (
                          <div className="admin-file-editor">
                            <p className="admin-file-editor-title">Edit file</p>
                            {isLoadingFile ? (
                              <p className="admin-workspace-status">Loading file…</p>
                            ) : fileError ? (
                              <p className="admin-workspace-status admin-workspace-error">
                                {fileError}
                              </p>
                            ) : fileDetails !== null ? (
                              <form className="admin-file-form" onSubmit={handleSaveFile}>
                                <label className="admin-file-label" htmlFor="admin-edit-name">
                                  File name
                                </label>
                                <input
                                  id="admin-edit-name"
                                  className="admin-file-input"
                                  type="text"
                                  value={editName}
                                  onChange={handleEditNameChange}
                                />

                                <label className="admin-file-label" htmlFor="admin-edit-content">
                                  File content
                                </label>
                                <textarea
                                  id="admin-edit-content"
                                  className="admin-file-input admin-file-textarea"
                                  value={editContent}
                                  onChange={handleEditContentChange}
                                  rows={6}
                                />

                                {saveError && (
                                  <p className="admin-workspace-error" role="alert">
                                    {saveError}
                                  </p>
                                )}

                                <div className="admin-file-actions">
                                  <button
                                    type="button"
                                    className="action"
                                    onClick={handleCancelEdit}
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="submit"
                                    className="action action-primary"
                                    disabled={isSavingFile}
                                  >
                                    {isSavingFile ? 'Saving…' : 'Save Changes'}
                                  </button>
                                </div>
                              </form>
                            ) : null}
                          </div>
                        )}
                      </>
                    ) : null}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

export default AdminDashboard