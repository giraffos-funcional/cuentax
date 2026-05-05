/**
 * Pure-SVG sparkline. No deps. Renders a smoothed line through the
 * series with a minimal area fill. Pass values left-to-right (oldest
 * first → most recent last).
 */

interface SparklineProps {
  values: number[]
  width?: number
  height?: number
  stroke?: string
  fill?: string
  className?: string
}

export function Sparkline({
  values,
  width  = 140,
  height = 32,
  stroke = 'currentColor',
  fill   = 'currentColor',
  className,
}: SparklineProps) {
  if (values.length === 0) return null
  const padding = 2
  const w = width  - padding * 2
  const h = height - padding * 2
  const max = Math.max(...values)
  const min = Math.min(...values)
  const range = max - min || 1
  const step = values.length > 1 ? w / (values.length - 1) : w

  const pts = values.map((v, i) => {
    const x = padding + step * i
    const y = padding + h - ((v - min) / range) * h
    return [x, y] as const
  })

  const linePath = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ')
  const areaPath = `${linePath} L${(padding + w).toFixed(2)},${(padding + h).toFixed(2)} L${padding},${(padding + h).toFixed(2)} Z`

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={className} role="img" aria-label="trend">
      <path d={areaPath} fill={fill} fillOpacity="0.12" />
      <path d={linePath} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}
