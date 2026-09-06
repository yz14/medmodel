import type {
  HealthResponse,
  InferenceResult,
  InstanceListResponse,
  ModelListResponse,
  ModelSpec,
  OverviewStats,
  Page,
  SeriesSummary,
  StudySummary,
  StudyUploadResponse,
  TaskCreateResponse,
  TaskSummary,
} from '@/types/api'
import { ApiError, parseErrorBody } from '@/lib/errors'

export { ApiError } from '@/lib/errors'

export type LiveHealthResponse = { status: 'ok'; version: string }
export type ReadyHealthResponse = {
  status: 'ready' | 'not_ready'
  database: string
  models: number
  queue: { queued: number; running: number; max_concurrency: number }
}
export type ModelReadyResponse = {
  model_id: string
  ready: boolean
  enabled: boolean
  version: string
  message: string
}

async function parseError(res: Response): Promise<ApiError> {
  let body: unknown
  try {
    body = await res.json()
  } catch {
    body = undefined
  }
  return parseErrorBody(body, res.status, res.statusText)
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  if (init?.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const res = await fetch(path, { ...init, headers })
  if (!res.ok) throw await parseError(res)
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export const api = {
  health: () => request<HealthResponse>('/api/v1/health'),
  healthLive: () => request<LiveHealthResponse>('/api/v1/health/live'),
  healthReady: () => request<ReadyHealthResponse>('/api/v1/health/ready'),

  overview: () => request<OverviewStats>('/api/v1/stats/overview'),

  listStudies: (params: {
    page?: number
    page_size?: number
    modality?: string
    body_part?: string
    q?: string
  } = {}) => {
    const qs = new URLSearchParams()
    if (params.page) qs.set('page', String(params.page))
    if (params.page_size) qs.set('page_size', String(params.page_size))
    if (params.modality) qs.set('modality', params.modality)
    if (params.body_part) qs.set('body_part', params.body_part)
    if (params.q) qs.set('q', params.q)
    const q = qs.toString()
    return request<Page<StudySummary>>(`/api/v1/studies${q ? `?${q}` : ''}`)
  },

  getStudy: (studyUid: string) => request<StudySummary>(`/api/v1/studies/${encodeURIComponent(studyUid)}`),

  uploadStudies: (
    files: File[],
    opts?: { onProgress?: (ratio: number) => void; signal?: AbortSignal },
  ) => {
    const form = new FormData()
    files.forEach((f) => form.append('files', f))
    if (!opts?.onProgress) {
      return request<StudyUploadResponse>('/api/v1/studies/upload', {
        method: 'POST',
        body: form,
        signal: opts?.signal,
      })
    }
    return new Promise<StudyUploadResponse>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('POST', '/api/v1/studies/upload')
      xhr.responseType = 'json'
      xhr.upload.onprogress = (ev) => {
        if (!ev.lengthComputable) return
        opts.onProgress?.(ev.loaded / Math.max(1, ev.total))
      }
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(xhr.response as StudyUploadResponse)
          return
        }
        reject(parseErrorBody(xhr.response, xhr.status, xhr.statusText || '上传失败'))
      }
      xhr.onerror = () => reject(new ApiError('网络错误', 0))
      xhr.onabort = () => reject(new ApiError('已取消', 0, 'UPLOAD_ABORTED'))
      const onAbort = () => xhr.abort()
      if (opts.signal) {
        if (opts.signal.aborted) {
          xhr.abort()
          return
        }
        opts.signal.addEventListener('abort', onAbort, { once: true })
      }
      xhr.send(form)
    })
  },

  seedDemo: () =>
    request<StudySummary>('/api/v1/studies/seed-demo', {
      method: 'POST',
    }),

  getSeries: (seriesUid: string) =>
    request<SeriesSummary>(`/api/v1/series/${encodeURIComponent(seriesUid)}`),

  listInstances: (seriesUid: string) =>
    request<InstanceListResponse>(`/api/v1/series/${encodeURIComponent(seriesUid)}/instances`),

  frameUrl: (seriesUid: string, idx: number) =>
    `/api/v1/series/${encodeURIComponent(seriesUid)}/frames/${idx}`,

  thumbnailUrl: (seriesUid: string) =>
    `/api/v1/series/${encodeURIComponent(seriesUid)}/thumbnail`,

  listModels: (enabledOnly = false) => {
    const qs = enabledOnly ? '?enabled_only=true' : ''
    return request<ModelListResponse>(`/api/v1/models${qs}`)
  },

  getModel: (modelId: string) => request<ModelSpec>(`/api/v1/models/${encodeURIComponent(modelId)}`),

  getModelReady: (modelId: string) =>
    request<ModelReadyResponse>(`/api/v1/models/${encodeURIComponent(modelId)}/ready`),

  patchModel: (modelId: string, body: { enabled?: boolean; default_params?: Record<string, unknown> }) =>
    request<ModelSpec>(`/api/v1/models/${encodeURIComponent(modelId)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  createTask: (body: { series_uid: string; model_id: string; params?: Record<string, unknown> }) =>
    request<TaskCreateResponse>('/api/v1/tasks', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  listTasks: (params: {
    page?: number
    page_size?: number
    status?: string
    model_id?: string
    q?: string
  } = {}) => {
    const qs = new URLSearchParams()
    if (params.page) qs.set('page', String(params.page))
    if (params.page_size) qs.set('page_size', String(params.page_size))
    if (params.status) qs.set('status', params.status)
    if (params.model_id) qs.set('model_id', params.model_id)
    if (params.q) qs.set('q', params.q)
    const q = qs.toString()
    return request<Page<TaskSummary>>(`/api/v1/tasks${q ? `?${q}` : ''}`)
  },

  getTask: (taskId: string) => request<TaskSummary>(`/api/v1/tasks/${encodeURIComponent(taskId)}`),

  getTaskResult: (taskId: string) =>
    request<InferenceResult>(`/api/v1/tasks/${encodeURIComponent(taskId)}/result`),

  cancelTask: (taskId: string) =>
    request<TaskSummary>(`/api/v1/tasks/${encodeURIComponent(taskId)}/cancel`, { method: 'POST' }),

  retryTask: (taskId: string) =>
    request<TaskCreateResponse>(`/api/v1/tasks/${encodeURIComponent(taskId)}/retry`, {
      method: 'POST',
    }),

  artifactUrl: (taskId: string, name: string) =>
    `/api/v1/tasks/${encodeURIComponent(taskId)}/artifacts/${encodeURIComponent(name)}`,

  maskFrameUrl: (taskId: string, sliceIndex: number, prefix = 'label') =>
    `/api/v1/tasks/${encodeURIComponent(taskId)}/mask-frames/${sliceIndex}?prefix=${encodeURIComponent(prefix)}`,

  taskEventsUrl: (taskId: string) =>
    `/api/v1/tasks/${encodeURIComponent(taskId)}/events`,

  createReport: (
    taskId: string,
    body: {
      finding_ids?: string[]
      reviews?: { finding_id: string; status: string; note?: string | null }[]
      export_seg?: boolean
      export_sr?: boolean
      export_gsps?: boolean
    } = {},
  ) =>
    request<ReportResponse>(`/api/v1/tasks/${encodeURIComponent(taskId)}/reports`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
}

export type ReportArtifact = {
  name: string
  uri: string
  media_type: string
  size_bytes?: number | null
  url?: string | null
}

export type ReportResponse = {
  report_id: string
  task_id: string
  model_id: string
  model_version: string
  finding_ids: string[]
  text: string
  artifacts: ReportArtifact[]
}
