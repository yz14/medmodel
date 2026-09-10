import { format, formatDistanceToNow, parseISO } from 'date-fns'
import { zhCN } from 'date-fns/locale'

/** Treat naive ISO (no Z/offset) as UTC — matches backend SQLite + utc_iso contract. */
export function parseApiDate(value: string): Date {
  const trimmed = value.trim()
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(trimmed)) {
    return parseISO(trimmed)
  }
  return parseISO(`${trimmed}Z`)
}

export function formatDateTime(value?: string | null) {
  if (!value) return '—'
  try {
    return format(parseApiDate(value), 'yyyy-MM-dd HH:mm:ss')
  } catch {
    return value
  }
}

export function formatDate(value?: string | null) {
  if (!value) return '—'
  if (/^\d{8}$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
  }
  try {
    return format(parseApiDate(value), 'yyyy-MM-dd')
  } catch {
    return value
  }
}

export function formatRelative(value?: string | null) {
  if (!value) return '—'
  try {
    return formatDistanceToNow(parseApiDate(value), { addSuffix: true, locale: zhCN })
  } catch {
    return value
  }
}

export function formatPercent(value?: number | null, digits = 0) {
  if (value == null || Number.isNaN(value)) return '—'
  return `${(value * 100).toFixed(digits)}%`
}

export function formatMs(value?: number | null) {
  if (value == null) return '—'
  if (value < 1000) return `${Math.round(value)} ms`
  return `${(value / 1000).toFixed(1)} s`
}

export function formatNumber(value?: number | null, digits = 0) {
  if (value == null || Number.isNaN(value)) return '—'
  return value.toLocaleString('zh-CN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

export function shortUid(uid?: string | null, head = 8, tail = 4) {
  if (!uid) return '—'
  if (uid.length <= head + tail + 1) return uid
  return `${uid.slice(0, head)}…${uid.slice(-tail)}`
}

/** DICOM PN: Family^Given^Middle… → readable label. */
export function formatPatientName(pn?: string | null): string {
  if (!pn || !pn.trim()) return '未知患者'
  const parts = pn.split('^').map((p) => p.trim()).filter(Boolean)
  if (parts.length === 0) return '未知患者'
  if (parts.length === 1) return parts[0]!
  // Prefer "Given Family" for Latin; keep order for CJK-looking tokens
  const family = parts[0]!
  const given = parts[1]!
  const cjk = /[\u4e00-\u9fff]/.test(family + given)
  return cjk ? `${family}${given}` : `${given} ${family}`
}

export function formatSex(sex?: string | null): string {
  if (!sex) return '—'
  const s = sex.trim().toUpperCase()
  if (s === 'M' || s === 'MALE') return '男'
  if (s === 'F' || s === 'FEMALE') return '女'
  if (s === 'O' || s === 'OTHER') return '其他'
  return sex
}

/** DICOM AS e.g. 045Y / 003M → 45岁 / 3月 */
export function formatAge(age?: string | null): string {
  if (!age) return '—'
  const m = /^(\d+)\s*([DWMYdwmy])?$/.exec(age.trim())
  if (!m) return age
  const n = Number.parseInt(m[1]!, 10)
  const unit = (m[2] || 'Y').toUpperCase()
  if (unit === 'Y') return `${n}岁`
  if (unit === 'M') return `${n}月`
  if (unit === 'W') return `${n}周`
  if (unit === 'D') return `${n}天`
  return age
}
