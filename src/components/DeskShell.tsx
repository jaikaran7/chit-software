import { useState, type FormEvent } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'

const links = [
  { to: '/', label: 'Dashboard', end: true, icon: HomeIcon },
  { to: '/chits', label: 'Chits', end: false, icon: ChitIcon },
  { to: '/members', label: 'Members', end: false, icon: PeopleIcon },
  { to: '/reports', label: 'Reports', end: false, icon: ChartIcon },
]

export function DeskShell() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')

  function search(event: FormEvent) {
    event.preventDefault()
    const next = query.trim()
    navigate(next ? `/members?q=${encodeURIComponent(next)}` : '/members')
  }

  return (
    <div className="desk min-h-dvh bg-[#eef3f8] text-slate-900">
      <div className="flex min-h-dvh">
        <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col bg-[#0c1324] text-white md:flex">
          <div className="flex items-center gap-3 px-5 pt-6">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-violet-400 to-sky-400 text-sm font-bold">
              C
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">ChitBase</p>
              <p className="text-[10px] font-medium tracking-[0.16em] text-slate-400">BY CHITBASE</p>
            </div>
          </div>
          <form onSubmit={search} className="px-4 pt-5">
            <label className="flex h-11 items-center gap-2 rounded-2xl bg-white/8 px-3 text-sm text-slate-300 ring-1 ring-white/10">
              <SearchIcon />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search members..."
                className="w-full bg-transparent outline-none placeholder:text-slate-500"
              />
              <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] text-slate-400">⌘K</span>
            </label>
          </form>
          <nav className="mt-4 px-3">
            <ul className="space-y-1">
              {links.map((link) => (
                <li key={link.to}>
                  <NavLink
                    to={link.to}
                    end={link.end}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium ${
                        isActive ? 'bg-[#1c2a44] text-white' : 'text-slate-300 hover:bg-white/5'
                      }`
                    }
                  >
                    <link.icon />
                    {link.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <div className="mt-auto space-y-3 px-4 pb-5">
            <div className="flex items-center justify-between rounded-2xl px-2 py-2 text-sm text-slate-300">
              <span className="flex items-center gap-2">
                <BellIcon />
                Notifications
              </span>
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-white/10 px-1 text-[11px]">0</span>
            </div>
            <p className="px-2 text-xs text-slate-500">Inbox is up to date</p>
            <div className="flex items-center gap-3 rounded-2xl px-2 py-2">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-slate-700 text-xs font-semibold">OR</span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">Organizer</p>
                <p className="truncate text-xs text-slate-400">Chit ledger</p>
              </div>
            </div>
          </div>
        </aside>
        <div className="min-w-0 flex-1">
          <main className="px-3 py-4 pb-20 md:px-8 md:py-6 md:pb-6">
            <Outlet />
          </main>
          <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur md:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
            <ul className="grid grid-cols-4">
              {links.map((link) => (
                <li key={link.to}>
                  <NavLink
                    to={link.to}
                    end={link.end}
                    className={({ isActive }) =>
                      `flex flex-col items-center gap-0.5 py-1.5 text-[10px] font-medium leading-none ${isActive ? 'text-[#111827]' : 'text-slate-400'}`
                    }
                  >
                    <link.icon size={18} />
                    {link.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>
    </div>
  )
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3-3" />
    </svg>
  )
}

function HomeIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" />
    </svg>
  )
}

function ChitIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  )
}

function PeopleIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19c.6-3 2.7-4.5 5.5-4.5S14.4 16 15 19" />
      <circle cx="17" cy="9" r="2.2" />
      <path d="M16.5 14.6c2.2.3 3.8 1.6 4.3 4.4" />
    </svg>
  )
}

function ChartIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 19h16" />
      <path d="M7 16v-4M12 16V8M17 16v-6" />
    </svg>
  )
}

function BellIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M6 16V10a6 6 0 1 1 12 0v6l1.5 2H4.5L6 16Z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </svg>
  )
}
