import { Link, useLocation } from 'react-router-dom'
import { Activity, Bell, Moon, Search, Sun, User } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useUiStore } from '@/stores/ui-store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'

const PAGE_META: Array<{ match: (path: string) => boolean; title: string; parent?: string }> = [
  { match: (p) => p === '/', title: '总览' },
  { match: (p) => p.startsWith('/data'), title: '数据中心' },
  { match: (p) => p.startsWith('/models/') && p !== '/models', title: '模型详情', parent: '模型仓库' },
  { match: (p) => p.startsWith('/models'), title: '模型仓库' },
  { match: (p) => p.startsWith('/tasks/') && p !== '/tasks', title: '任务详情', parent: '推理任务' },
  { match: (p) => p.startsWith('/tasks'), title: '推理任务' },
  { match: (p) => p.startsWith('/settings'), title: '系统设置' },
]

function resolvePage(pathname: string): { title: string; parent?: string } {
  return PAGE_META.find((m) => m.match(pathname)) ?? { title: 'VoxFlow' }
}

export function AppTopbar() {
  const theme = useUiStore((s) => s.theme)
  const toggleTheme = useUiStore((s) => s.toggleTheme)
  const location = useLocation()
  const page = resolvePage(location.pathname)
  const health = useQuery({
    queryKey: ['health'],
    queryFn: api.health,
    refetchInterval: 30_000,
    retry: 1,
  })

  return (
    <header className="flex h-14 items-center gap-3 border-b border-border bg-surface-1/80 px-4 backdrop-blur">
      <Breadcrumb className="min-w-0 shrink">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/">VoxFlow</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          {page.parent && (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link
                    to={
                      page.parent === '模型仓库'
                        ? '/models'
                        : page.parent === '推理任务'
                          ? '/tasks'
                          : '/'
                    }
                  >
                    {page.parent}
                  </Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
            </>
          )}
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="font-medium text-fg-strong">{page.title}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mx-auto hidden w-full max-w-sm md:block">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <Input
            className="h-8 bg-surface-0 pl-8 text-xs"
            placeholder="搜索检查 / 任务 / 模型…"
            aria-label="全局搜索（即将推出）"
            disabled
            title="全局搜索即将推出"
          />
        </div>
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        {health.data ? (
          <Badge variant={health.data.status === 'ok' ? 'success' : 'warning'} className="hidden sm:inline-flex">
            <Activity className="mr-1 h-3 w-3" />
            API · v{health.data.version}
          </Badge>
        ) : health.isError ? (
          <Badge variant="danger">API 不可用</Badge>
        ) : null}
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="通知（即将推出）" disabled title="通知即将推出">
          <Bell className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="用户菜单（即将推出）" disabled title="用户菜单即将推出">
          <User className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleTheme} aria-label="切换主题">
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
      </div>
    </header>
  )
}
