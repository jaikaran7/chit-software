import { NavLink, Outlet, useLocation } from 'react-router-dom'

const links = [
  { to: '/', label: 'Home', end: true },
  { to: '/members', label: 'Members', end: false },
  { to: '/payments', label: 'Payments', end: false },
  { to: '/more', label: 'More', end: false },
]

export function Shell() {
  const location = useLocation()
  const hideNav = location.pathname.startsWith('/receipts')

  return (
    <div className="mx-auto min-h-dvh w-full max-w-[430px] bg-paper">
      <main className={`px-4 pt-5 ${hideNav ? 'pb-8' : 'pb-32'}`}>
        <Outlet />
      </main>
      {!hideNav && (
        <nav className="fixed bottom-0 left-1/2 z-20 w-full max-w-[430px] -translate-x-1/2 border-t border-line bg-[#fffaf3]/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur">
          <ul className="grid grid-cols-4 gap-1">
            {links.map((link) => (
              <li key={link.to}>
                <NavLink
                  to={link.to}
                  end={link.end}
                  className={({ isActive }) =>
                    `flex h-12 items-center justify-center rounded-2xl text-sm font-semibold ${isActive ? 'bg-grove text-white' : 'text-muted'}`
                  }
                >
                  {link.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  )
}
