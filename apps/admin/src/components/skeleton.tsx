/**
 * Tailwind-only skeleton bones — pulse animation, no deps.
 */
interface SkeletonProps {
  className?: string
}
export function Skeleton({ className = '' }: SkeletonProps) {
  return <div className={`animate-pulse bg-zinc-200/60 rounded ${className}`} />
}

export function CardSkeleton() {
  return (
    <div className="bg-white border border-border rounded-lg p-4 space-y-3">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-7 w-32" />
    </div>
  )
}

export function TableRowSkeleton({ cols = 5 }: { cols?: number }) {
  return (
    <tr className="border-t border-border">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
      ))}
    </tr>
  )
}
