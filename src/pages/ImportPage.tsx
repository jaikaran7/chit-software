import { useEffect, useMemo, useState } from 'react'
import { Banner, Button, Card, Field, Header, controlClass } from '../components/ui'
import { CHATGPT_TABLE_PROMPT, parseAmount, parseMonth, parseTable } from '../lib/parseTable'
import { errorMessage, formatMoney, formatMonth } from '../lib/format'
import { listGroups, type GroupCard } from '../services/groups'
import { getImportMapping, importSchedules, listSchedules, saveImportMapping } from '../services/schedules'

type MappedRow = {
  month: string | null
  payout: number | null
  normal: number | null
  post: number | null
  rawMonth: string
}

export function ImportPage() {
  const [groups, setGroups] = useState<GroupCard[]>([])
  const [groupId, setGroupId] = useState('')
  const [paste, setPaste] = useState('')
  const [monthCol, setMonthCol] = useState('')
  const [payoutCol, setPayoutCol] = useState('')
  const [normalCol, setNormalCol] = useState('')
  const [postCol, setPostCol] = useState('')
  const [applyScheme, setApplyScheme] = useState(false)
  const [existing, setExisting] = useState<Set<string>>(new Set())
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    listGroups().then(setGroups).catch((err: unknown) => setError(errorMessage(err)))
  }, [])

  useEffect(() => {
    if (!groupId) return
    Promise.all([getImportMapping(groupId), listSchedules(groupId)]).then(([mapping, schedules]) => {
      if (mapping) {
        setMonthCol(mapping.month_column ?? '')
        setPayoutCol(mapping.payout_column ?? '')
        setNormalCol(mapping.normal_installment_column ?? '')
        setPostCol(mapping.post_withdrawal_column ?? '')
      }
      setExisting(new Set(schedules.map((row) => row.month.slice(0, 10))))
    }).catch((err: unknown) => setError(errorMessage(err)))
  }, [groupId])

  const parsed = useMemo(() => parseTable(paste), [paste])
  const headers = parsed.headers

  const mapped: MappedRow[] = parsed.rows.map((row) => {
    const cell = (header: string) => {
      const index = headers.indexOf(header)
      return index >= 0 ? row[index] ?? '' : ''
    }
    return {
      rawMonth: cell(monthCol),
      month: parseMonth(cell(monthCol)),
      payout: parseAmount(cell(payoutCol)),
      normal: normalCol ? parseAmount(cell(normalCol)) : null,
      post: postCol ? parseAmount(cell(postCol)) : null,
    }
  })

  const invalid = mapped.filter((row) => !row.month || row.payout == null || row.payout <= 0)
  const duplicateInPaste = mapped.filter((row, index) => row.month && mapped.findIndex((item) => item.month === row.month) !== index)
  const conflicts = mapped.filter((row) => row.month && existing.has(row.month))

  async function copyPrompt() {
    await navigator.clipboard.writeText(CHATGPT_TABLE_PROMPT)
    setMessage('Prompt copied.')
  }

  async function run(mode: 'commit' | 'replace' | 'skip') {
    if (!groupId) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await saveImportMapping(groupId, {
        month_column: monthCol,
        payout_column: payoutCol,
        normal_installment_column: normalCol || null,
        post_withdrawal_column: postCol || null,
      })
      const result = await importSchedules(
        groupId,
        mapped.filter((row) => row.month && row.payout).map((row) => ({
          month: row.month as string,
          scheduled_payout_amount: row.payout as number,
          noted_normal_installment: row.normal,
          noted_post_withdrawal_installment: row.post,
        })),
        mode,
        applyScheme,
      )
      setMessage(`Imported ${result.inserted}, replaced ${result.updated}, skipped ${result.skipped}.`)
      const schedules = await listSchedules(groupId)
      setExisting(new Set(schedules.map((row) => row.month.slice(0, 10))))
    } catch (err) {
      const text = errorMessage(err)
      setError(text.startsWith('DUPLICATE_MONTHS:') ? 'Some months already exist. Choose replace or skip.' : text)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <Header title="Import schedule" subtitle="Paste the table ChatGPT returns. Nothing is overwritten until you choose." />
      <Field label="Group">
        <select className={controlClass} value={groupId} onChange={(event) => setGroupId(event.target.value)}>
          <option value="">Select group</option>
          {groups.filter((group) => group.status === 'active').map((group) => (
            <option key={group.id} value={group.id}>{group.name}</option>
          ))}
        </select>
      </Field>
      <Card>
        <p className="text-sm leading-5 text-muted">Use this prompt with the photo in ChatGPT, then paste only the table here.</p>
        <pre className="mt-3 whitespace-pre-wrap text-xs leading-5">{CHATGPT_TABLE_PROMPT}</pre>
        <button type="button" className="mt-3 text-sm font-semibold text-grove" onClick={() => void copyPrompt()}>Copy prompt</button>
      </Card>
      <Field label="Pasted table">
        <textarea className={`${controlClass} h-40 py-3`} value={paste} onChange={(event) => setPaste(event.target.value)} />
      </Field>
      {headers.length > 0 && (
        <>
          <ColumnMap label="Month" headers={headers} value={monthCol} onChange={setMonthCol} />
          <ColumnMap label="Scheduled payout amount" headers={headers} value={payoutCol} onChange={setPayoutCol} />
          <ColumnMap label="Normal installment" headers={headers} value={normalCol} onChange={setNormalCol} optional />
          <ColumnMap label="Post-withdrawal installment" headers={headers} value={postCol} onChange={setPostCol} optional />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={applyScheme} onChange={(event) => setApplyScheme(event.target.checked)} />
            Update this group’s installment amounts when every row agrees
          </label>
          <div className="space-y-2">
            {mapped.map((row, index) => (
              <Card key={`${row.rawMonth}-${index}`}>
                <p className="font-semibold">{row.month ? formatMonth(row.month) : row.rawMonth || 'Invalid month'}</p>
                <p className="text-sm">Payout {row.payout == null ? 'invalid' : formatMoney(row.payout)}</p>
                {row.month && existing.has(row.month) && <p className="text-sm text-gold">Already in this group</p>}
              </Card>
            ))}
          </div>
          {(invalid.length > 0 || duplicateInPaste.length > 0) && (
            <Banner>Fix invalid months, amounts, or repeated months before importing.</Banner>
          )}
          {conflicts.length > 0 && invalid.length === 0 && duplicateInPaste.length === 0 && (
            <div className="space-y-2">
              <p className="text-sm">These months already have a schedule. Replace them, skip them, or cancel.</p>
              <Button disabled={busy} onClick={() => void run('replace')}>Replace</Button>
              <Button tone="ghost" disabled={busy} onClick={() => void run('skip')}>Skip</Button>
              <Button tone="ghost" onClick={() => setPaste('')}>Cancel</Button>
            </div>
          )}
          {conflicts.length === 0 && invalid.length === 0 && duplicateInPaste.length === 0 && mapped.length > 0 && (
            <Button disabled={busy || !monthCol || !payoutCol} onClick={() => void run('commit')}>{busy ? 'Importing…' : 'Confirm import'}</Button>
          )}
        </>
      )}
      {message && <p className="text-sm text-grove">{message}</p>}
      {error && <Banner>{error}</Banner>}
    </div>
  )
}

function ColumnMap({ label, headers, value, onChange, optional = false }: { label: string; headers: string[]; value: string; onChange: (value: string) => void; optional?: boolean }) {
  return (
    <Field label={label}>
      <select className={controlClass} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{optional ? 'Not in this table' : 'Choose column'}</option>
        {headers.map((header) => <option key={header} value={header}>{header}</option>)}
      </select>
    </Field>
  )
}
