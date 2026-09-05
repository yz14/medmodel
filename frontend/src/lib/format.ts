import { format, formatDistanceToNow, parseISO } from 'date-fns'
import { zhCN } from 'date-fns/locale'

export function formatDateTime(value?: string | null) {
  if (!value) return '—'
  try {
    return format(parseISO(value), 'yyyy-MM-dd HH:mm:ss')
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
    return format(parseISO(value), 'yyyy-MM-dd')
  } catch {
    return value
  }
}

export function formatRelative(value?: string | null) {
  if (!value) return '—'
  try {
    return formatDistanceToNow(parseISO(value), { addSuffix: true, locale: zhCN })
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
