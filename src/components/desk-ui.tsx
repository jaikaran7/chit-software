import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'

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

export function DeskInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-[15px] text-slate-900 outline-none ring-emerald-500/30 placeholder:text-slate-300 focus:ring-2 ${props.className ?? ''}`}
    />
  )
}
