const LBS_PER_SKID = 37800 // ~42 lbs per case * 900 dozen / 12 eggs per case ≈ 37,800

export default function CapacityBar({ current, max, weightCurrent, weightMax }) {
  if (!max || max <= 0) return null

  const pct = Math.min((current / max) * 100, 100)
  const color = pct >= 90 ? 'capacity-red' : pct >= 75 ? 'capacity-yellow' : 'capacity-green'

  const estWeight = current * LBS_PER_SKID
  const overWeight = weightMax && estWeight > weightMax

  return (
    <div className="space-y-1">
      <div className="capacity-bar">
        <div className={`capacity-fill ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-lvf-muted">{current} / {max} skids</span>
        <span className={`font-mono ${overWeight ? 'text-lvf-warning font-semibold' : 'text-lvf-muted'}`}>
          {estWeight.toLocaleString()} lbs
          {weightMax ? ` / ${weightMax.toLocaleString()}` : ''}
          {overWeight && ' (over weight)'}
        </span>
      </div>
    </div>
  )
}
