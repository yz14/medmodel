/** Display labels for AI findings / model output (hospital-facing Chinese). */

const FINDING_LABEL_ZH: Record<string, string> = {
  nodule: '结节',
  Nodule: '结节',
  NODULE: '结节',
  lung: '肺',
  Lung: '肺',
  LUNG: '肺',
  'left lung': '左肺',
  'Left Lung': '左肺',
  'right lung': '右肺',
  'Right Lung': '右肺',
  benign: '良性',
  Benign: '良性',
  malignant: '恶性',
  Malignant: '恶性',
}

export function findingLabelZh(label: string | null | undefined): string {
  if (!label) return '未命名'
  return FINDING_LABEL_ZH[label] ?? FINDING_LABEL_ZH[label.toLowerCase()] ?? label
}

/** Parse backend structured_report.txt into display sections (#46). */
export type ReportSection = {
  id: string
  title: string
  lines: string[]
}

export function parseReportSections(text: string): ReportSection[] {
  const raw = text.replace(/\r\n/g, '\n').trim()
  if (!raw) return []

  const sections: ReportSection[] = []
  let current: ReportSection = { id: 'header', title: '患者 / 检查', lines: [] }

  const flush = () => {
    if (current.lines.some((l) => l.trim())) sections.push(current)
  }

  const start = (id: string, title: string) => {
    flush()
    current = { id, title, lines: [] }
  }

  for (const line of raw.split('\n')) {
    const t = line.trim()
    if (t === '—— 结果摘要 ——' || t === '——结果摘要——') {
      start('summary', '结果摘要')
      continue
    }
    if (/^一[、.．]/.test(t)) {
      start('seg', t.replace(/^一[、.．]\s*/, '') || '分割发现')
      continue
    }
    if (/^二[、.．]/.test(t)) {
      start('det', t.replace(/^二[、.．]\s*/, '') || '检测发现')
      continue
    }
    if (/^三[、.．]/.test(t)) {
      start('cls', t.replace(/^三[、.．]\s*/, '') || '分类结果')
      continue
    }
    if (t.startsWith('【免责声明】') || t.startsWith('免责声明')) {
      start('disclaimer', '免责声明')
      current.lines.push(t.replace(/^【免责声明】/, '').trim() || t)
      continue
    }
    if (t.startsWith('【VoxFlow')) {
      // skip banner title; keep following meta in header
      continue
    }
    current.lines.push(line)
  }
  flush()
  return sections
}
