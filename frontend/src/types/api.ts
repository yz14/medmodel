/**
 * Thin API type surface over OpenAPI-generated schemas (B-10).
 * Regenerate with `npm run generate:api` — do not hand-edit openapi.d.ts.
 */
import type { components } from './openapi'

type Schemas = components['schemas']

export type HealthResponse = Schemas['HealthResponse']
export type QueueStatus = Schemas['QueueStatus']
export type OverviewStats = Schemas['OverviewStats']
export type OverviewKpis = Schemas['OverviewKpis']
export type ModelMetricItem = Schemas['ModelMetricItem']
export type DailyTaskPoint = Schemas['DailyTaskPoint']
export type ModelUsageItem = Schemas['ModelUsageItem']
export type SeriesSummary = Schemas['SeriesSummary']
export type StudySummary = Schemas['StudySummary']
export type StudyLastTask = Schemas['StudyLastTask']
export type StudyUploadResponse = Schemas['StudyUploadResponse']
export type InstanceItem = Schemas['InstanceItem']
export type InstanceListResponse = Schemas['InstanceListResponse']
export type ModelListResponse = Schemas['ModelListResponse']
export type ModelPatchRequest = Schemas['ModelPatchRequest']
export type ModelOutputSpec = Schemas['ModelOutputSpec']
export type ModelSpec = Schemas['ModelSpec']
export type ArtifactRef = Schemas['ArtifactRef']
export type TaskLog = Schemas['TaskLog']
export type TaskSummary = Schemas['TaskSummary']
export type TaskCreateRequest = Schemas['TaskCreateRequest']
export type TaskCreateResponse = Schemas['TaskCreateResponse']
export type MaskArtifact = Schemas['MaskArtifact']
export type DetectionBox = Schemas['DetectionBox']
export type ClassificationPrediction = Schemas['ClassificationPrediction']
export type InferenceResult = Schemas['InferenceResult']

export type Page<T> = {
  items: T[]
  total: number
  page: number
  page_size: number
}

export type TaskStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled'
export type TaskStage = 'queued' | 'preprocess' | 'infer' | 'postprocess' | 'writing' | 'done' | string
export type TaskType = 'segmentation' | 'detection' | 'classification'
export type ResultType = 'segmentation' | 'detection' | 'classification'

/** JSON Schema subset used by dynamic ModelParamsForm (params_schema payload). */
export interface JsonSchemaProperty {
  type?: string
  title?: string
  description?: string
  default?: unknown
  minimum?: number
  maximum?: number
  enum?: unknown[]
  items?: JsonSchemaProperty
}

export interface JsonSchema {
  type?: string
  properties?: Record<string, JsonSchemaProperty>
  required?: string[]
  additionalProperties?: boolean
}

export interface ApiErrorBody {
  code: string
  message: string
  details?: unknown
  trace_id?: string | null
}

/** Narrow OpenAPI free-form object into JsonSchema for the params form. */
export function asJsonSchema(value: unknown): JsonSchema {
  if (value && typeof value === 'object') return value as JsonSchema
  return { type: 'object', properties: {} }
}
