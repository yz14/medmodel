import { Link, NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Database,
  Boxes,
  ListTodo,
  Settings,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUiStore } from '@/stores/ui-store'
import { Button } from '@/components/ui/button'

const NAV = [
  { to: '/', label: '总览', icon: LayoutDashboard, end: true },
  { to: '/data', label: '数据中心', icon: Database },
  { to: '/models', label: '模型仓库', icon: Boxes },
  { to: '/tasks', label: '推理任务', icon: ListTodo },
  { to: '/settings', label: '系统设置', icon: Settings },
]

export function AppSidebar() {
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed)
  const viewerShellActive = useUiStore((s) => s.viewerShellActive)
  const collapsed = viewerShellActive || sidebarCollapsed
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)

  return (
    <aside
      className={cn(
        'flex h-full flex-col border-r border-border bg-surface-1 transition-[width] duration-200',
        collapsed ? 'w-[72px]' : 'w-60',
      )}
    >
      <div
        className={cn(
          'flex h-14 items-center gap-2 border-b border-border px-3',
          collapsed ? 'justify-center' : 'justify-between',
        )}
      >
        <Link
          to="/"
          className={cn('flex min-w-0 items-center gap-2', collapsed && 'justify-center')}
          title="VoxFlow 首页"
          aria-label="VoxFlow 首页"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand text-sm font-bold text-white">
            V
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-fg-strong">VoxFlow</div>
              <div className="truncate text-xs text-muted">医学影像 AI</div>
            </div>
          )}
        </Link>
        {!viewerShellActive && !collapsed && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={toggleSidebar}
            aria-label="收起侧栏"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-2">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                collapsed && 'justify-center px-2',
                isActive
                  ? 'bg-brand/15 text-brand'
                  : 'text-muted hover:bg-surface-2 hover:text-fg',
              )
            }
            title={collapsed ? item.label : undefined}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {collapsed && !viewerShellActive && (
        <div className="border-t border-border p-2">
          <Button
            variant="ghost"
            size="icon"
            className="w-full"
            onClick={toggleSidebar}
            aria-label="展开侧栏"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </aside>
  )
}
