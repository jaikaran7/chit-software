import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DarkButton, DeskCard, GhostButton } from '../../components/desk-ui'
import { errorMessage } from '../../lib/format'
import { rpc } from '../../lib/rpc'

export function SettingsPage() {
  const navigate = useNavigate()
  const [showConfirm, setShowConfirm] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleReset() {
    if (confirmText !== 'RESET') {
      setError('Please type RESET to confirm')
      return
    }

    setBusy(true)
    setError(null)
    
    try {
      const result = await rpc<{ success: boolean; deleted: Record<string, number> }>('reset_all_data', {})
      
      if (result.success) {
        setSuccess(true)
        setShowConfirm(false)
        setConfirmText('')
        
        // Wait a moment then navigate to dashboard
        setTimeout(() => {
          // Reload the page to clear all cached state
          window.location.href = '/'
        }, 2000)
      }
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-[600px]">
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Settings</h1>
      <p className="mb-6 text-sm text-slate-500">Manage your chit ledger</p>

      {success && (
        <div className="mb-6 rounded-2xl bg-emerald-50 px-4 py-3 ring-1 ring-emerald-200">
          <p className="font-semibold text-emerald-900">All data has been reset</p>
          <p className="mt-1 text-sm text-emerald-700">Redirecting to clean dashboard...</p>
        </div>
      )}

      <DeskCard className="p-6">
        <h2 className="text-lg font-semibold text-slate-900">Danger Zone</h2>
        <p className="mt-1 text-sm text-slate-500">
          Irreversible actions that will permanently delete your data
        </p>

        <div className="mt-6 rounded-2xl border-2 border-rose-200 bg-rose-50 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-semibold text-rose-900">Reset all data</h3>
              <p className="mt-1 text-sm text-rose-700">
                Permanently delete all chit groups, members, payments, prizes, receipts, and ledger records
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowConfirm(true)}
              disabled={busy || success}
              className="shrink-0 rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Reset...
            </button>
          </div>

          {showConfirm && (
            <div className="mt-4 space-y-3 rounded-xl border-t-2 border-rose-300 bg-white p-4">
              <p className="text-sm font-semibold text-rose-900">
                ⚠️ This action cannot be undone
              </p>
              <p className="text-sm text-slate-600">
                This will permanently delete:
              </p>
              <ul className="ml-4 list-disc space-y-1 text-sm text-slate-600">
                <li>All chit groups (active and archived)</li>
                <li>All members and their membership records</li>
                <li>All payment collections and records</li>
                <li>All prize payouts and withdrawal records</li>
                <li>All receipts and audit logs</li>
              </ul>
              <p className="text-sm font-medium text-slate-900">
                Your account and login will NOT be deleted. You can start fresh after reset.
              </p>
              
              <div className="mt-4">
                <label className="block text-sm font-medium text-slate-700">
                  Type <span className="font-mono font-bold text-rose-600">RESET</span> to confirm:
                  <input
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder="Type RESET here"
                    disabled={busy}
                    className="mt-2 h-11 w-full rounded-xl border-2 border-slate-200 px-3 text-base outline-none ring-rose-500/30 focus:border-rose-500 focus:ring-2 disabled:bg-slate-100"
                  />
                </label>
              </div>

              {error && (
                <div className="rounded-xl bg-rose-100 px-3 py-2 text-sm text-rose-800">
                  {error}
                </div>
              )}

              <div className="flex gap-2">
                <GhostButton
                  onClick={() => {
                    setShowConfirm(false)
                    setConfirmText('')
                    setError(null)
                  }}
                  disabled={busy}
                  className="flex-1"
                >
                  Cancel
                </GhostButton>
                <DarkButton
                  onClick={handleReset}
                  disabled={busy || confirmText !== 'RESET'}
                  className="flex-1 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300"
                >
                  {busy ? 'Resetting...' : 'Reset All Data'}
                </DarkButton>
              </div>
            </div>
          )}
        </div>
      </DeskCard>

      <div className="mt-6">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="text-sm font-medium text-slate-500 hover:text-slate-700"
        >
          ← Back to Dashboard
        </button>
      </div>
    </div>
  )
}
