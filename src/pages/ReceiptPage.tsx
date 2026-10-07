import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Banner, Button, Field, controlClass } from '../components/ui'
import { errorMessage, formatMoney, formatMonth } from '../lib/format'
import { buildSlip, downloadBlob, renderReceiptPng } from '../lib/receiptSlip'
import { getReceipt, type ReceiptView } from '../services/receipts'
import { voidCollection } from '../services/payments'
import { voidPayout } from '../services/withdrawals'

export function ReceiptPage() {
  const { receiptId = '' } = useParams()
  const navigate = useNavigate()
  const [receipt, setReceipt] = useState<ReceiptView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    getReceipt(receiptId).then(setReceipt).catch((err: unknown) => setError(errorMessage(err)))
  }, [receiptId])

  if (!receipt) {
    return <div>{error ? <Banner>{error}</Banner> : <p className="text-muted">Loading receipt…</p>}</div>
  }

  const slip = buildSlip(receipt)

  async function download() {
    if (!receipt) return
    setError(null)
    setNotice(null)
    try {
      const blob = await renderReceiptPng(buildSlip(receipt))
      downloadBlob(blob, buildSlip(receipt).filename)
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  async function share() {
    if (!receipt) return
    setError(null)
    setNotice(null)
    try {
      const model = buildSlip(receipt)
      const blob = await renderReceiptPng(model)
      const file = new File([blob], model.filename, { type: 'image/png' })
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: model.groupName })
        return
      }
      downloadBlob(blob, model.filename)
      setNotice('Receipt image downloaded. Share it from your photos or files.')
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setError(errorMessage(err))
    }
  }

  async function reverse() {
    if (!receipt) return
    setBusy(true)
    setError(null)
    try {
      if (receipt.receipt_type === 'COLLECTION' && receipt.payment_id) await voidCollection(receipt.payment_id, reason)
      if (receipt.receipt_type === 'PAYOUT' && receipt.withdrawal_id) await voidPayout(receipt.withdrawal_id, reason)
      setReceipt(await getReceipt(receiptId))
      setReason('')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <article className="mx-auto w-full max-w-[320px] bg-card px-5 py-5 text-left ring-1 ring-ink">
        <h1 className="text-center font-display text-[1.7rem] leading-none">{slip.groupName}</h1>
        <p className="mt-2 text-center text-xs font-semibold text-muted">{slip.kicker}</p>
        <div className="my-4 border-t border-dashed border-ink/40" />
        <dl className="space-y-3">
          {slip.lines.map((line) => (
            <div key={line.label}>
              <dt className="text-xs text-muted">{line.label}</dt>
              <dd className={line.emphasis ? 'font-display text-2xl leading-none' : 'text-base font-semibold'}>{line.value}</dd>
            </div>
          ))}
        </dl>
        <div className="my-4 border-t border-dashed border-ink/40" />
        <p className={`text-center text-sm font-semibold ${slip.reversed ? 'text-clay' : 'text-grove'}`}>{slip.footer}</p>
      </article>
      {(receipt.allocations ?? []).length > 1 && (
        <ul className="mx-auto mt-3 w-full max-w-[320px] space-y-1 text-sm">
          {(receipt.allocations ?? []).map((allocation) => (
            <li key={`${allocation.allocation_kind}-${allocation.due_month}`} className="flex justify-between gap-3">
              <span className="text-muted">{allocation.allocation_kind === 'joining' ? 'Catch-up' : formatMonth(allocation.due_month)}</span>
              <span className="font-semibold">{formatMoney(allocation.allocated_amount)}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mx-auto mt-4 w-full max-w-[320px] space-y-2">
        <Button onClick={() => void download()}>Download</Button>
        <Button tone="ghost" onClick={() => void share()}>Share</Button>
        <Button tone="ghost" onClick={() => navigate('/')}>Done</Button>
      </div>
      {receipt.status !== 'voided' && (
        <div className="mx-auto mt-6 w-full max-w-[320px] space-y-2">
          <Field label="Reverse this receipt">
            <input className={controlClass} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason" />
          </Field>
          <Button tone="clay" disabled={busy || reason.trim() === ''} onClick={() => void reverse()}>Reverse</Button>
        </div>
      )}
      {notice && <p className="mx-auto mt-3 w-full max-w-[320px] text-sm text-grove">{notice}</p>}
      {error && <div className="mx-auto mt-3 w-full max-w-[320px]"><Banner>{error}</Banner></div>}
    </div>
  )
}
