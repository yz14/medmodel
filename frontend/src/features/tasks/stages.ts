/** Shared task-stage labels for Gantt + log timeline. */

export const GANTT_STAGES = ['preprocess', 'infer', 'postprocess', 'writing'] as const

export const STAGE_LABEL: Record<string, string> = {
  queued: '排队',
  preprocess: '预处理',
  infer: '推理',
  postprocess: '后处理',
  writing: '写回',
  done: '完成',
}

export function stageLabel(stage: string | null | undefined): string {
  if (!stage) return '—'
  return STAGE_LABEL[stage] ?? stage
}
