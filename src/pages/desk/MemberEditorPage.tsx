import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Avatar, DarkButton, DeskCard, DeskInput, FieldLabel, avatarTone } from '../../components/desk-ui'
import { readProfile, writeProfile } from '../../lib/chitMeta'
import { errorMessage } from '../../lib/format'
import { createMember, getMember, updateMember } from '../../services/members'

export function MemberEditorPage() {
  const { memberId } = useParams()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  const [legacy, setLegacy] = useState('')
  const [portal, setPortal] = useState(false)
  const [status, setStatus] = useState('active')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!memberId) return
    getMember(memberId)
      .then((member) => {
        if (!member) return
        const profile = readProfile(member.notes)
        setName(member.name)
        setPhone(member.mobile ?? '')
        setEmail(profile.email)
        setAddress(member.address ?? '')
        setLegacy(profile.legacy)
        setPortal(profile.portal)
        setStatus(member.status)
      })
      .catch((err: unknown) => setError(errorMessage(err)))
  }, [memberId])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) return setError('Enter the full name')
    setBusy(true)
    setError(null)
    try {
      const notes = writeProfile({ email: email.trim(), portal, legacy })
      if (memberId) {
        await updateMember(memberId, name.trim(), phone.trim(), address.trim(), notes, status, 'Member profile updated')
      } else {
        await createMember(name.trim(), phone.trim(), address.trim(), notes)
      }
      navigate('/members')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-[720px] space-y-4">
      <div className="flex items-center gap-3">
        <Link to="/members" className="grid h-10 w-10 place-items-center rounded-full bg-white ring-1 ring-slate-200">←</Link>
        {memberId ? (
          <div className="flex items-center gap-3">
            <Avatar name={name || 'M'} tone={avatarTone(name || 'M')} />
            <div>
              <p className="text-[11px] font-semibold tracking-[0.14em] text-slate-400">EDIT MEMBER</p>
              <h1 className="text-2xl font-semibold">{name || 'Member'}</h1>
            </div>
          </div>
        ) : (
          <h1 className="text-2xl font-semibold">New member</h1>
        )}
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <DeskCard className="p-6">
        <p className="text-xs font-semibold tracking-[0.14em] text-slate-400">IDENTITY</p>
        <div className="mt-4">
          <FieldLabel>Full name</FieldLabel>
          <DeskInput value={name} onChange={(event) => setName(event.target.value)} required />
        </div>
      </DeskCard>
      <DeskCard className="p-6">
        <p className="text-xs font-semibold tracking-[0.14em] text-slate-400">CONTACT</p>
        <div className="mt-4 space-y-4">
          <div>
            <FieldLabel>Phone number</FieldLabel>
            <div className="flex gap-2">
              <span className="grid h-12 place-items-center rounded-2xl bg-slate-50 px-3 text-sm ring-1 ring-slate-200">+91</span>
              <DeskInput value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" placeholder="98765 43210" />
            </div>
          </div>
          <div>
            <FieldLabel>Email</FieldLabel>
            <DeskInput value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="you@example.com" />
          </div>
          <div>
            <FieldLabel>Address</FieldLabel>
            <DeskInput value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Street, city" />
          </div>
        </div>
      </DeskCard>
      <DarkButton type="submit" disabled={busy} className="w-full">{busy ? 'Saving…' : memberId ? 'Save member' : 'Add member'}</DarkButton>
    </form>
  )
}
