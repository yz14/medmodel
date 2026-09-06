import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { subscribeSse } from '@/lib/sse'
import type { TaskSummary } from '@/types/api'

const LOG_REFRESH_DEBOUNCE_MS = 1500

/**
 * SSE as primary live channel for task progress (B-8 / N-F8).
 * Patches React Query cache; exposes reactive `connected` so pollers can back off.
 * Debounced invalidate pulls fresh logs for the timeline while the task runs.
 */
export function useTaskSSE(taskId: string | null | undefined, enabled = true) {
  const queryClient = useQueryClient()
  const [connected, setConnected] = useState(false)
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!taskId || !enabled) {
      setConnected(false)
      return
    }

    const current = queryClient.getQueryData<TaskSummary>(['task', taskId])
    if (current && ['succeeded', 'failed', 'canceled'].includes(current.status)) {
      setConnected(false)
      return
    }

    const scheduleLogRefresh = () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current)
      refreshTimer.current = setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: ['task', taskId] })
      }, LOG_REFRESH_DEBOUNCE_MS)
    }

    setConnected(false)
    const unsubscribe = subscribeSse(api.taskEventsUrl(taskId), {
      onOpen: () => {
        setConnected(true)
      },
      onEvent: (data) => {
        const type = String(data.type ?? '')
        if (type === 'ping' || type === 'snapshot' || type === 'progress' || type === 'running' || type === 'queued') {
          queryClient.setQueryData<TaskSummary>(['task', taskId], (old) => {
            const base =
              old ??
              ({
                task_id: taskId,
                series_uid: '',
                model_id: '',
                params: {},
                status: 'queued',
                progress: 0,
                cache_hit: false,
                artifacts: [],
              } as TaskSummary)
            return {
              ...base,
              status: (data.status as TaskSummary['status']) ?? base.status,
              stage: (data.stage as string) ?? base.stage,
              progress: typeof data.progress === 'number' ? data.progress : base.progress,
              message: typeof data.message === 'string' ? data.message : base.message,
            }
          })
          if (type === 'progress' || type === 'running' || type === 'snapshot') {
            scheduleLogRefresh()
          }
        }
        if (type === 'succeeded' || type === 'failed' || type === 'canceled') {
          queryClient.setQueryData<TaskSummary>(['task', taskId], (old) => {
            if (!old) return old
            return {
              ...old,
              status: type as TaskSummary['status'],
              progress: type === 'succeeded' ? 1 : old.progress,
              message: typeof data.message === 'string' ? data.message : old.message,
            }
          })
          void queryClient.invalidateQueries({ queryKey: ['task', taskId] })
          void queryClient.invalidateQueries({ queryKey: ['tasks'] })
          if (type === 'succeeded') {
            void queryClient.invalidateQueries({ queryKey: ['task-result', taskId] })
          }
        }
      },
      onError: () => {
        setConnected(false)
      },
    })

    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current)
      unsubscribe()
    }
  }, [taskId, enabled, queryClient])

  return { connected }
}
