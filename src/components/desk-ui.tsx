import { useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'

export function DeskCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-[28px] bg-white shadow-[0_10px_40px_rgba(15,23,42,0.05)] ring-1 ring-slate-200/70 ${className}`}>
      {children}
    </section>
  )
}

export function GreenButton({ className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-full bg-[#14915a] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0f7a4b] disabled:cursor-not-allowed disabled:bg-slate-300 ${className}`}
    />
  )
}

export function GhostButton({ className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50 disabled:opacity-50 ${className}`}
    />
  )
}

export function DarkButton({ className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-full bg-[#111827] px-5 py-3 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:bg-slate-300 ${className}`}
    />
  )
}

export function Avatar({ name, tone = 'slate' }: { name: string; tone?: 'rose' | 'teal' | 'slate' | 'blue' }) {
  const tones = {
    rose: 'bg-rose-100 text-rose-700',
    teal: 'bg-teal-100 text-teal-700',
    slate: 'bg-slate-100 text-slate-600',
    blue: 'bg-sky-100 text-sky-700',
  }
  return (
    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-semibold ${tones[tone]}`}>
      {name.trim().slice(0, 1).toUpperCase() || '?'}
    </span>
  )
}

export function avatarTone(name: string): 'rose' | 'teal' | 'slate' | 'blue' {
  const tones = ['rose', 'teal', 'blue', 'slate'] as const
  const code = name.split('').reduce((total, char) => total + char.charCodeAt(0), 0)
  return tones[code % tones.length]
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <p className="mb-2 text-sm font-medium text-slate-500">{children}</p>
}

export function DeskSelect({
  label,
  value,
  options,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const selected = options.find((option) => option.value === value)

  useEffect(() => {
    if (!open) return
    function onPointer(event: MouseEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex h-11 w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 text-left text-base font-semibold text-slate-900"
      >
        <span className="truncate">{selected?.label || placeholder || label}</span>
        <span className="text-xs text-slate-400">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="absolute z-40 mt-2 w-full overflow-hidden rounded-2xl bg-white shadow-[0_16px_40px_rgba(15,23,42,0.12)] ring-1 ring-slate-200">
          <p className="px-4 pt-3 pb-1 text-xs font-semibold text-slate-400">{label}</p>
          <ul role="listbox" aria-label={label} className="max-h-64 overflow-y-auto py-1">
            {options.map((option) => {
              const active = option.value === value
              return (
                <li key={option.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      onChange(option.value)
                      setOpen(false)
                    }}
                    className={`flex w-full px-4 py-2.5 text-left text-sm font-medium ${active ? 'bg-[#111827] text-white' : 'text-slate-700 hover:bg-slate-50'}`}
                  >
                    {option.label}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

export function DeskInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-[15px] text-slate-900 outline-none ring-emerald-500/30 placeholder:text-slate-300 focus:ring-2 ${props.className ?? ''}`}
    />
  )
}
