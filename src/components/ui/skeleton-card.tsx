import { Card, CardContent, CardHeader } from "@/components/ui/card"

// Pre-generated widths, shuffled once at module load — no function calls during render
const _widths = Array.from({ length: 10 }, () => 80 + Math.random() * 20)

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  const widths = _widths.slice(0, lines)

  return (
    <Card>
      <CardHeader className="space-y-2">
        <div className="h-4 w-40 bg-muted rounded animate-pulse" />
        <div className="h-3 w-64 bg-muted/50 rounded animate-pulse" />
      </CardHeader>
      <CardContent className="space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} className="h-3 bg-muted/40 rounded animate-pulse" style={{ width: `${widths[i]}%` }} />
        ))}
      </CardContent>
    </Card>
  )
}
