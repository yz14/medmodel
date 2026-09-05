export type SseHandler = (data: Record<string, unknown>) => void

export interface SubscribeSseOptions {
  onEvent: SseHandler
  onError?: (err: unknown) => void
  onOpen?: () => void
  /** Stop reconnecting after a terminal event type */
  terminalTypes?: string[]
  maxRetries?: number
  baseDelayMs?: number
  maxDelayMs?: number
}

/**
 * EventSource with exponential backoff reconnect (B-8).
 * Returns an unsubscribe function.
 */
export function subscribeSse(url: string, options: SubscribeSseOptions | SseHandler) {
  const opts: SubscribeSseOptions =
    typeof options === 'function' ? { onEvent: options } : options

  const terminalTypes = new Set(opts.terminalTypes ?? ['succeeded', 'failed', 'canceled'])
  const maxRetries = opts.maxRetries ?? 12
  const baseDelayMs = opts.baseDelayMs ?? 800
  const maxDelayMs = opts.maxDelayMs ?? 20_000

  let closed = false
  let retry = 0
  let source: EventSource | null = null
  let timer: ReturnType<typeof setTimeout> | null = null

  const cleanupTimer = () => {
    if (timer != null) {
      clearTimeout(timer)
      timer = null
    }
  }

  const connect = () => {
    if (closed) return
    cleanupTimer()
    source = new EventSource(url)

    source.onopen = () => {
      retry = 0
      opts.onOpen?.()
    }

    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as Record<string, unknown>
        opts.onEvent(data)
        const type = String(data.type ?? '')
        if (terminalTypes.has(type)) {
          closed = true
          source?.close()
        }
      } catch (err) {
        opts.onError?.(err)
      }
    }

    source.onerror = (err) => {
      source?.close()
      source = null
      if (closed) return
      opts.onError?.(err)
      if (retry >= maxRetries) return
      const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** retry)
      retry += 1
      timer = setTimeout(connect, delay)
    }
  }

  connect()

  return () => {
    closed = true
    cleanupTimer()
    source?.close()
    source = null
  }
}
