export class ApiError extends Error {
  status: number
  code?: string
  details?: unknown

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

/** Normalize unknown thrown values into a user-facing message (Toast-ready). */
export function errorMessage(err: unknown, fallback = '操作失败'): string {
  if (err instanceof ApiError) return err.message || fallback
  if (err instanceof Error && err.message.trim()) return err.message
  if (typeof err === 'string' && err.trim()) return err
  if (err && typeof err === 'object') {
    const o = err as { message?: unknown; detail?: unknown }
    if (typeof o.message === 'string' && o.message.trim()) return o.message
    if (typeof o.detail === 'string' && o.detail.trim()) return o.detail
    if (o.detail && typeof o.detail === 'object') {
      const d = o.detail as { message?: unknown }
      if (typeof d.message === 'string' && d.message.trim()) return d.message
    }
  }
  return fallback
}

/** Parse FastAPI / VoxFlow error JSON body into ApiError fields. */
export function parseErrorBody(
  body: unknown,
  status: number,
  statusText = '',
): ApiError {
  let message = statusText || '请求失败'
  let code: string | undefined
  let details: unknown
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>
    if (typeof b.message === 'string' && typeof b.code === 'string') {
      message = b.message
      code = b.code
      details = b.details
    } else {
      const detail = b.detail
      if (typeof detail === 'string') {
        message = detail
      } else if (detail && typeof detail === 'object') {
        const d = detail as Record<string, unknown>
        if (typeof d.message === 'string') message = d.message
        if (typeof d.code === 'string') code = d.code
        details = d.details
      } else if (typeof b.message === 'string') {
        message = b.message
        if (typeof b.code === 'string') code = b.code
      }
    }
  }
  return new ApiError(message, status, code, details)
}
