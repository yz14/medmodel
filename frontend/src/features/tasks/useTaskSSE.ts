import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { subscribeSse } from '@/lib/sse'
import type { TaskSummary } from '@/types/api'

/**
 * SSE as primary live channel for task progress (B-8).
 * Patches React Query cache; stops after terminal status.
 */
export function useTaskSSE(taskId: string | null | undefined, enabled = true) {
  const queryClient = useQueryClient()
  const connectedRef = useRef(false)

  useEffect(() => {
    if (!taskId || !enabled) return

    const current = queryClient.getQueryData<TaskSummary>(['task', taskId])
    if (current && ['succeeded', 'failed', 'canceled'].includes(current.status)) {
      return
    }

    return subscribeSse(api.taskEventsUrl(taskId), {
      onOpen: () => {
        connectedRef.current = true
      },
      onEvent: (data) => {
        const type = String(data.type ?? '')
        if (type === 'ping' || type === 'snapshot' || type === 'progress' || type === 'running' || type === 'queued') {
          queryClient.setQueryData<TaskSummary>(['task', taskId], (old) => {
            const base = old ?? ({ task_id: taskId, series_uid: '', model_id: '', params: {}, status: 'queued', progress: 0, cache_hit: false, artifacts: [] } as TaskSummary)
            return {
              ...base,
              status: (data.status as TaskSummary['status']) ?? base.status,
              stage: (data.stage as string) ?? base.stage,
              progress: typeof data.progress === 'number' ? data.progress : base.progress,
              message: typeof data.message === 'string' ? data.message : base.message,
            }
          })
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
        connectedRef.current = false
      },
    })
  }, [taskId, enabled, queryClient])

  return { sseConnected: connectedRef }
}
