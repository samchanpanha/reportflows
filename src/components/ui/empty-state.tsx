import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

interface EmptyStateProps {
  icon: string
  title: string
  description: string
  action?: { label: string; href?: string; onClick?: () => void }
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-16 text-center">
        <span className="text-5xl mb-4">{icon}</span>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-muted-foreground text-sm mt-1 max-w-md">{description}</p>
        {action && (
          action.href ? (
            <a href={action.href}>
              <Button className="mt-4">{action.label}</Button>
            </a>
          ) : (
            <Button className="mt-4" onClick={action.onClick}>{action.label}</Button>
          )
        )}
      </CardContent>
    </Card>
  )
}
