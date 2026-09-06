/**
 * 产品术语表：统一中英文对照，避免页面各自硬编码不一致。
 * 用法：`t('study')` → 「检查」
 */
const TERMS = {
  study: '检查',
  series: '序列',
  instance: '实例',
  slice: '层',
  modality: '模态',
  finding: '检出',
  mask: '分割掩膜',
  bbox: '检测框',
  window: '窗宽',
  level: '窗位',
  ww: '窗宽',
  wl: '窗位',
  hu: 'HU',
  inference: '推理',
  task: '任务',
  model: '模型',
  report: '报告',
  overlay: '叠加',
  viewport: '视口',
  hang: '挂片',
  patient: '患者',
  accession: '检查号',
  queued: '排队中',
  running: '运行中',
  succeeded: '成功',
  failed: '失败',
  canceled: '已取消',
} as const

export type TermKey = keyof typeof TERMS

export function t(key: TermKey): string {
  return TERMS[key]
}

export function termOr(key: string, fallback?: string): string {
  if (key in TERMS) return TERMS[key as TermKey]
  return fallback ?? key
}

export { TERMS }
