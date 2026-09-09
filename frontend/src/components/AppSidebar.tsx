import { NavLink } from 'react-router-dom'
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

/** FE-5: clinical / annotation / viewer-home 从主导航收口；阅片从数据中心进入。 */
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
      <div className={cn('flex h-14 items-center gap-2 border-b border-border px-3', collapsed && 'justify-center')}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand text-sm font-bold text-white">
          V
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-fg-strong">VoxFlow</div>
            <div className="truncate text-xs text-muted">医学影像 AI 模型平台</div>
          </div>
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

      <div className="border-t border-border p-2">
        <Button
          variant="ghost"
          size={collapsed ? 'icon' : 'sm'}
          className={cn('w-full', !collapsed && 'justify-start')}
          onClick={toggleSidebar}
          disabled={viewerShellActive}
          title={viewerShellActive ? '阅片模式下侧栏已收起' : undefined}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          {!collapsed && '收起侧栏'}
        </Button>
      </div>
    </aside>
  )
}
