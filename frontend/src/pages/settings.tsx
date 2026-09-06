import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { useUiStore } from '@/stores/ui-store'

export function SettingsPage() {
  const theme = useUiStore((s) => s.theme)
  const setTheme = useUiStore((s) => s.setTheme)
  const experimentalCs3d = useUiStore((s) => s.experimentalCs3d)
  const setExperimentalCs3d = useUiStore((s) => s.setExperimentalCs3d)
  const health = useQuery({ queryKey: ['health'], queryFn: api.health })

  return (
    <div>
      <PageHeader title="系统设置" description="主题与平台信息" />

      <div className="grid max-w-2xl gap-4">
        <Card>
          <CardHeader>
            <CardTitle>外观</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-fg-strong">深色主题</div>
                <div className="text-xs text-muted">阅片默认深色，可切换浅色管理视图</div>
              </div>
              <Switch
                checked={theme === 'dark'}
                onCheckedChange={(v) => setTheme(v ? 'dark' : 'light')}
                aria-label="深色主题"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>实验功能</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm text-fg-strong">Cornerstone3D Spike</div>
                <div className="text-xs text-muted">
                  评估路由，非正式阅片路径。默认关闭；详见 docs/r6-cornerstone3d-spike.md
                </div>
              </div>
              <Switch
                checked={experimentalCs3d}
                onCheckedChange={setExperimentalCs3d}
                aria-label="启用 Cornerstone3D Spike"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>关于 VoxFlow</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted">
            <p>VoxFlow · 医学影像 AI 模型平台</p>
            <p>把院内自研模型统一注册、调用、质控与交付。</p>
            {health.data && (
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <dt className="text-muted">API 状态</dt>
                  <dd className="text-fg">{health.data.status}</dd>
                </div>
                <div>
                  <dt className="text-muted">版本</dt>
                  <dd className="text-fg">{health.data.version}</dd>
                </div>
                <div>
                  <dt className="text-muted">数据库</dt>
                  <dd className="text-fg">{health.data.database}</dd>
                </div>
                <div>
                  <dt className="text-muted">已注册模型</dt>
                  <dd className="text-fg">{health.data.models}</dd>
                </div>
              </dl>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
