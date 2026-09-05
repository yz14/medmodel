import { useEffect, useMemo, useRef } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import type { JsonSchema, JsonSchemaProperty } from '@/types/api'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'

function buildZodSchema(schema?: JsonSchema) {
  const properties = schema?.properties ?? {}
  const shape: Record<string, z.ZodTypeAny> = {}

  for (const [key, prop] of Object.entries(properties)) {
    shape[key] = propToZod(prop)
  }

  return z.object(shape)
}

function propToZod(prop: JsonSchemaProperty): z.ZodTypeAny {
  if (prop.type === 'boolean') {
    return z.boolean()
  }
  if (prop.enum?.length) {
    const values = prop.enum.map(String)
    return z.enum(values as [string, ...string[]])
  }
  if (prop.type === 'integer') {
    let n = z.number().int('请输入整数')
    if (typeof prop.minimum === 'number') n = n.min(prop.minimum, `最小 ${prop.minimum}`)
    if (typeof prop.maximum === 'number') n = n.max(prop.maximum, `最大 ${prop.maximum}`)
    return n
  }
  if (prop.type === 'number') {
    let n = z.number()
    if (typeof prop.minimum === 'number') n = n.min(prop.minimum, `最小 ${prop.minimum}`)
    if (typeof prop.maximum === 'number') n = n.max(prop.maximum, `最大 ${prop.maximum}`)
    return n
  }
  return z.string()
}

function defaultsFromSchema(
  schema?: JsonSchema,
  seed?: Record<string, unknown>,
): Record<string, unknown> {
  const properties = schema?.properties ?? {}
  const out: Record<string, unknown> = { ...(seed ?? {}) }
  for (const [key, prop] of Object.entries(properties)) {
    if (out[key] !== undefined) continue
    if (prop.default !== undefined) out[key] = prop.default
    else if (prop.type === 'boolean') out[key] = false
    else if (prop.type === 'integer' || prop.type === 'number') out[key] = prop.minimum ?? 0
    else if (prop.enum?.length) out[key] = String(prop.enum[0])
    else out[key] = ''
  }
  return out
}

export function ModelParamsForm({
  schema,
  values,
  onChange,
  onValidityChange,
}: {
  schema?: JsonSchema
  values?: Record<string, unknown>
  onChange: (next: Record<string, unknown>) => void
  onValidityChange?: (valid: boolean) => void
}) {
  const properties = schema?.properties ?? {}
  const entries = Object.entries(properties)

  const zodSchema = useMemo(() => buildZodSchema(schema), [schema])
  // Parent remounts with key=modelId; capture seed once to avoid reset loops.
  const seedRef = useRef(values)
  const defaultValues = useMemo(() => defaultsFromSchema(schema, seedRef.current), [schema])

  const {
    control,
    watch,
    reset,
    formState: { errors, isValid },
  } = useForm<Record<string, unknown>>({
    resolver: zodResolver(zodSchema),
    defaultValues,
    mode: 'onChange',
  })

  useEffect(() => {
    reset(defaultsFromSchema(schema, seedRef.current))
  }, [schema, reset])

  useEffect(() => {
    const sub = watch((formValues) => {
      onChange({ ...formValues })
    })
    return () => sub.unsubscribe()
  }, [watch, onChange])

  useEffect(() => {
    onValidityChange?.(isValid)
  }, [isValid, onValidityChange])

  if (!entries.length) {
    return <p className="text-[11px] text-muted">该模型无额外参数</p>
  }

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted">推理参数</div>
      {entries.map(([key, prop]) => {
        const title = prop.title || key
        const error = errors[key]?.message as string | undefined

        if (prop.type === 'boolean') {
          return (
            <div key={key} className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-fg">{title}</span>
                <Controller
                  name={key}
                  control={control}
                  render={({ field }) => (
                    <Switch
                      checked={Boolean(field.value)}
                      onCheckedChange={field.onChange}
                      aria-label={title}
                    />
                  )}
                />
              </div>
              {error && <p className="text-[11px] text-danger">{error}</p>}
            </div>
          )
        }

        if (prop.enum?.length) {
          return (
            <label key={key} className="block space-y-1">
              <span className="text-xs text-muted">{title}</span>
              <Controller
                name={key}
                control={control}
                render={({ field }) => (
                  <select
                    className="flex h-9 w-full rounded-lg border border-border bg-surface-0 px-3 text-sm"
                    value={String(field.value ?? '')}
                    onChange={(e) => field.onChange(e.target.value)}
                    aria-invalid={!!error}
                  >
                    {prop.enum!.map((item) => (
                      <option key={String(item)} value={String(item)}>
                        {String(item)}
                      </option>
                    ))}
                  </select>
                )}
              />
              {error && <p className="text-[11px] text-danger">{error}</p>}
            </label>
          )
        }

        return (
          <label key={key} className="block space-y-1">
            <span className="text-xs text-muted">{title}</span>
            <Controller
              name={key}
              control={control}
              render={({ field }) => (
                <Input
                  type="number"
                  value={field.value === undefined || field.value === null ? '' : String(field.value)}
                  min={prop.minimum}
                  max={prop.maximum}
                  step={prop.type === 'integer' ? 1 : 'any'}
                  aria-invalid={!!error}
                  aria-label={title}
                  onChange={(e) => {
                    const raw = e.target.value
                    if (raw === '') {
                      field.onChange(undefined)
                      return
                    }
                    const n = prop.type === 'integer' ? parseInt(raw, 10) : Number(raw)
                    field.onChange(Number.isFinite(n) ? n : raw)
                  }}
                />
              )}
            />
            {error && <p className="text-[11px] text-danger">{error}</p>}
          </label>
        )
      })}
    </div>
  )
}
