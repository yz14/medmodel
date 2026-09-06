import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '@/lib/api'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { WINDOW_PRESETS } from '@/features/viewer/core'
import {
  useUiStore,
  type UiLocale,
  type WindowPresetId,
} from '@/stores/ui-store'
import type { ViewportLayout } from '@/stores/viewer-store'

const SHORTCUTS: Array<{ keys: string; action: string }> = [
  { keys: '1–6', action: '切换工具（滚层 / 窗宽窗位 / 平移 / 测距 / 缩放 / 探针）' },
  { keys: '↑ / PageUp', action: '上一层' },
  { keys: '↓ / PageDown', action: '下一层' },
  { keys: 'Home / End', action: '首层 / 末层' },
  { keys: 'F', action: '适应窗口' },
  { keys: 'R', action: '重置视图与测量' },
  { keys: 'H / V', action: '水平 / 垂直翻转' },
  { keys: 'I', action: '反色' },
  { keys: '[ / ]', action: '折叠左侧序列 / 右侧 AI 面板' },
]

const LAYOUT_OPTIONS: Array<{ id: ViewportLayout; label: string }> = [
  { id: '1x1', label: '1 × 1' },
  { id: '1x2', label: '1 × 2' },
  { id: '2x2', label: '2 × 2' },
]

export function SettingsPage() {
  const theme = useUiStore((s) => s.theme)
  const setTheme = useUiStore((s) => s.setTheme)
  const locale = useUiStore((s) => s.locale)
  const setLocale = useUiStore((s) => s.setLocale)
  const defaultWindowPreset = useUiStore((s) => s.defaultWindowPreset)
  const setDefaultWindowPreset = useUiStore((s) => s.setDefaultWindowPreset)
  const defaultViewportLayout = useUiStore((s) => s.defaultViewportLayout)
  const setDefaultViewportLayout = useUiStore((s) => s.setDefaultViewportLayout)
  const experimentalCs3d = useUiStore((s) => s.experimentalCs3d)
  const setExperimentalCs3d = useUiStore((s) => s.setExperimentalCs3d)
  const health = useQuery({ queryKey: ['health'], queryFn: api.health })

  return (
    <div>
      <PageHeader title="系统设置" description="外观、阅片默认值与快捷键" />

      <div className="grid max-w-2xl gap-4">
        <Card>
          <CardHeader>
            <CardTitle>外观与语言</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4">
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
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm text-fg-strong">界面语言</div>
                <div className="text-xs text-muted">偏好写入本机；当前文案以中文为主</div>
              </div>
              <Select value={locale} onValueChange={(v) => setLocale(v as UiLocale)}>
                <SelectTrigger className="w-36" aria-label="界面语言">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="zh">简体中文</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>阅片默认值</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm text-fg-strong">默认窗宽 / 窗位</div>
                <div className="text-xs text-muted">打开检查时应用；若序列自带 W/L 且默认为肺窗，仍可被序列覆盖</div>
              </div>
              <Select
                value={defaultWindowPreset}
                onValueChange={(v) => setDefaultWindowPreset(v as WindowPresetId)}
              >
                <SelectTrigger className="w-36" aria-label="默认窗宽窗位">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WINDOW_PRESETS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm text-fg-strong">默认布局</div>
                <div className="text-xs text-muted">打开检查时的视口网格</div>
              </div>
              <Select
                value={defaultViewportLayout}
                onValueChange={(v) => setDefaultViewportLayout(v as ViewportLayout)}
              >
                <SelectTrigger className="w-36" aria-label="默认布局">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LAYOUT_OPTIONS.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>阅片快捷键</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-40">按键</TableHead>
                  <TableHead>动作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {SHORTCUTS.map((row) => (
                  <TableRow key={row.keys}>
                    <TableCell className="font-mono text-xs text-fg">{row.keys}</TableCell>
                    <TableCell className="text-sm text-muted">{row.action}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>实验功能</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm text-fg-strong">Cornerstone3D（实验）</div>
                <div className="text-xs text-muted">
                  仅评估用。开启后可通过 URL{' '}
                  <code className="rounded bg-surface-2 px-1">/viewer-cs3d/:studyId</code>{' '}
                  访问；不进入正式阅片路径。
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
            <p className="text-xs">
              结构化报告与 DICOM 导出（SEG / SR / GSPS）已接入阅片 AI 面板；可从{' '}
              <Link to="/data" className="text-brand hover:underline">
                数据中心
              </Link>{' '}
              打开检查。
            </p>
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
