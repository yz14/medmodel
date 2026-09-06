/** Model evaluation metric labels & preferred keys by task type (FE-5). */

export const TASK_TYPE_LABEL: Record<string, string> = {
  segmentation: '分割',
  detection: '检测',
  classification: '分类',
}

export const METRIC_LABEL: Record<string, string> = {
  dice: 'Dice',
  iou: 'IoU',
  hd95: 'HD95 (mm)',
  asd: 'ASD (mm)',
  auc: 'AUC',
  accuracy: '准确率',
  sensitivity: '敏感度',
  specificity: '特异度',
  map: 'mAP',
  precision: '精确率',
  recall: '召回率',
  froc: 'FROC',
}

/** Preferred metric order for cards / tables by task type. */
export const METRICS_BY_TASK: Record<string, string[]> = {
  segmentation: ['dice', 'iou', 'hd95', 'asd'],
  detection: ['map', 'sensitivity', 'precision', 'froc'],
  classification: ['auc', 'accuracy', 'sensitivity', 'specificity'],
}

export function metricLabel(key: string): string {
  return METRIC_LABEL[key] ?? key.toUpperCase()
}

export function taskTypeLabel(taskType: string): string {
  return TASK_TYPE_LABEL[taskType] ?? taskType
}

export function orderedMetricEntries(
  taskType: string,
  metrics: Record<string, number> | null | undefined,
): Array<{ key: string; label: string; value: number }> {
  if (!metrics) return []
  const preferred = METRICS_BY_TASK[taskType] ?? []
  const seen = new Set<string>()
  const out: Array<{ key: string; label: string; value: number }> = []
  for (const key of preferred) {
    const v = metrics[key]
    if (v == null || Number.isNaN(v)) continue
    seen.add(key)
    out.push({ key, label: metricLabel(key), value: v })
  }
  for (const [key, value] of Object.entries(metrics)) {
    if (seen.has(key) || value == null || Number.isNaN(value)) continue
    out.push({ key, label: metricLabel(key), value })
  }
  return out
}

export function primaryMetrics(
  taskType: string,
  metrics: Record<string, number> | null | undefined,
  limit = 2,
): Array<{ key: string; label: string; value: number }> {
  return orderedMetricEntries(taskType, metrics).slice(0, limit)
}

/** Human-readable rows for ModelSpec.input_constraints (no JSON dump). */
export function constraintRows(
  constraints: Record<string, unknown> | null | undefined,
): Array<{ key: string; label: string; value: string }> {
  if (!constraints || Object.keys(constraints).length === 0) return []
  const labels: Record<string, string> = {
    modality: '模态',
    modalities: '模态',
    body_part: '部位',
    body_parts: '部位',
    min_slices: '最少层数',
    max_slices: '最多层数',
    spacing_mm: '层厚 (mm)',
  }
  return Object.entries(constraints).map(([key, raw]) => {
    let value: string
    if (Array.isArray(raw)) value = raw.map(String).join('、')
    else if (raw != null && typeof raw === 'object') value = JSON.stringify(raw)
    else value = String(raw ?? '—')
    return { key, label: labels[key] ?? key, value }
  })
}
