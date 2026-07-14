export default function RefererBreakdown({
  data,
}: {
  data: Record<string, number>
}) {
  const entries = Object.entries(data).sort(([, a], [, b]) => b - a)
  const total = entries.reduce((sum, [, count]) => sum + count, 0)

  if (entries.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-zinc-500">
        No referer data
      </div>
    )
  }

  return (
    <div className="space-y-2 p-4">
      {entries.map(([domain, count]) => {
        const pct = total > 0 ? (count / total) * 100 : 0
        return (
          <div key={domain} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-300">{domain}</span>
              <span className="text-zinc-400">
                {count} <span className="text-xs">({pct.toFixed(0)}%)</span>
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-zinc-800">
              <div
                className="h-1.5 rounded-full bg-blue-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
