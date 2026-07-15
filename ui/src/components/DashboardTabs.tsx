import { Link } from 'react-router-dom'

const TABS = [
  { key: 'live', label: 'Live', to: '/dashboard' },
  { key: 'history', label: 'Historical', to: '/dashboard/history' },
] as const

type Tab = (typeof TABS)[number]['key']

export default function DashboardTabs({ active }: { active: Tab }) {
  return (
    <div className="flex gap-1 rounded-lg bg-zinc-900 p-1">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          to={tab.to}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
            active === tab.key
              ? 'bg-zinc-700 text-zinc-100'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  )
}
