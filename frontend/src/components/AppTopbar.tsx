import { useQuery } from '@tanstack/react-query'
import { Activity, Moon, Sun } from 'lucide-react'
import { api } from '@/lib/api'
import { useUiStore } from '@/stores/ui-store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export function AppTopbar() {
  const theme = useUiStore((s) => s.theme)
  const toggleTheme = useUiStore((s) => s.toggleTheme)
  const health = useQuery({
    queryKey: ['health'],
    queryFn: api.health,
    refetchInterval: 30_000,
    retry: 1,
  })

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-surface-1/80 px-4 backdrop-blur">
      <div className="text-sm text-muted">
        院内自研模型统一注册 · 调用 · 质控 · 交付
      </div>
      <div className="flex items-center gap-2">
        {health.data ? (
          <Badge variant={health.data.status === 'ok' ? 'success' : 'warning'}>
            <Activity className="mr-1 h-3 w-3" />
            API {health.data.status} · v{health.data.version}
          </Badge>
        ) : health.isError ? (
          <Badge variant="danger">API 不可用</Badge>
        ) : (
          <Badge variant="secondary">检查中…</Badge>
        )}
        <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="切换主题">
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
      </div>
    </header>
  )
}
