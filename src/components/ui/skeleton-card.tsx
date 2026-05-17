import { Card, CardContent, CardHeader } from "@/components/ui/card"

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <Card>
      <CardHeader className="space-y-2">
        <div className="h-4 w-40 bg-muted rounded animate-pulse" />
        <div className="h-3 w-64 bg-muted/50 rounded animate-pulse" />
      </CardHeader>
      <CardContent className="space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} className="h-3 w-full bg-muted/40 rounded animate-pulse" style={{ width: `${80 + Math.random() * 20}%` }} />
        ))}
      </CardContent>
    </Card>
  )
}
