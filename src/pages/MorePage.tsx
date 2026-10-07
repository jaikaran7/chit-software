import { Link } from 'react-router-dom'
import { Card, Header } from '../components/ui'

const items = [
  { to: '/groups/new', title: 'New group', body: 'Name, installments, monthly payout, and members.' },
  { to: '/import', title: 'Import schedule', body: 'Paste a ChatGPT table and map the columns.' },
  { to: '/reports', title: 'Reports', body: 'Monthly totals, methods, and payouts.' },
  { to: '/members/new', title: 'New person', body: 'Add someone before placing them in a group.' },
]

export function MorePage() {
  return (
    <div>
      <Header title="More" subtitle="Setup, import, and reports." />
      <div className="space-y-2">
        {items.map((item) => (
          <Link key={item.to} to={item.to} className="block">
            <Card>
              <h2 className="font-display text-2xl">{item.title}</h2>
              <p className="mt-1 text-sm text-muted">{item.body}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
