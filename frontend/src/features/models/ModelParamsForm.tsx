import { useEffect, useMemo, useRef } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import type { JsonSchema, JsonSchemaProperty } from '@/types/api'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

function coerceEnumValue(raw: string, samples: unknown[]): unknown {
  const sample = samples[0]
  if (typeof sample === 'number') {
    const n = Number(raw)
    return Number.isFinite(n) ? n : raw
  }
  if (typeof sample === 'boolean') {
    return raw === 'true'
  }
  return raw
}

function propToZod(prop: JsonSchemaProperty, required: boolean): z.ZodTypeAny {
  let base: z.ZodTypeAny

  if (prop.type === 'boolean') {
    base = z.boolean()
  } else if (prop.enum?.length) {
    const values = prop.enum
    if (values.every((v) => typeof v === 'number')) {
      base = z.number().refine((v) => values.includes(v), { message: '请选择有效选项' })
    } else if (values.every((v) => typeof v === 'boolean')) {
      base = z.boolean().refine((v) => values.includes(v), { message: '请选择有效选项' })
    } else {
      const asStrings = values.map(String) as [string, ...string[]]
      base = z.enum(asStrings)
    }
  } else if (prop.type === 'integer') {
    let n = z.number({ error: '请输入数字' }).int('请输入整数')
    if (typeof prop.minimum === 'number') n = n.min(prop.minimum, `最小 ${prop.minimum}`)
    if (typeof prop.maximum === 'number') n = n.max(prop.maximum, `最大 ${prop.maximum}`)
    base = n
  } else if (prop.type === 'number') {
    let n = z.number({ error: '请输入数字' })
    if (typeof prop.minimum === 'number') n = n.min(prop.minimum, `最小 ${prop.minimum}`)
    if (typeof prop.maximum === 'number') n = n.max(prop.maximum, `最大 ${prop.maximum}`)
    base = n
  } else {
    base = z.string()
  }

  return required ? base : base.optional()
}

function buildZodSchema(schema?: JsonSchema) {
  const properties = schema?.properties ?? {}
  const required = new Set(schema?.required ?? [])
  const shape: Record<string, z.ZodTypeAny> = {}

  for (const [key, prop] of Object.entries(properties)) {
    shape[key] = propToZod(prop, required.has(key))
  }

  return z.object(shape)
}

function defaultsFromSchema(
  schema?: JsonSchema,
  seed?: Record<string, unknown>,
): Record<string, unknown> {
  const properties = schema?.properties ?? {}
  const out: Record<string, unknown> = { ...(seed ?? {}) }
  for (const [key, prop] of Object.entries(properties)) {
    if (out[key] !== undefined) continue
    if (prop.default !== undefined) {
      out[key] = prop.default
      continue
    }
    if (prop.type === 'boolean') out[key] = false
    else if (prop.enum?.length) out[key] = prop.enum[0]
    else if (prop.type === 'integer' || prop.type === 'number') {
      // Leave unset for required so validation surfaces; optional gets minimum/0
      if (!(schema?.required ?? []).includes(key)) {
        out[key] = prop.minimum ?? 0
      }
    } else if (!(schema?.required ?? []).includes(key)) {
      out[key] = ''
    }
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
  const required = new Set(schema?.required ?? [])
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
    return <p className="text-xs text-muted">该模型无额外参数</p>
  }

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted">推理参数</div>
      {entries.map(([key, prop]) => {
        const title = prop.title || key
        const error = errors[key]?.message as string | undefined
        const isRequired = required.has(key)

        if (prop.type === 'boolean') {
          return (
            <div key={key} className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-fg">
                  {title}
                  {isRequired ? <span className="text-danger"> *</span> : null}
                </span>
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
              {error && <p className="text-xs text-danger">{error}</p>}
            </div>
          )
        }

        if (prop.enum?.length) {
          return (
            <label key={key} className="block space-y-1">
              <span className="text-xs text-muted">
                {title}
                {isRequired ? <span className="text-danger"> *</span> : null}
              </span>
              <Controller
                name={key}
                control={control}
                render={({ field }) => (
                  <Select
                    value={String(field.value ?? '')}
                    onValueChange={(v) => field.onChange(coerceEnumValue(v, prop.enum!))}
                  >
                    <SelectTrigger aria-invalid={!!error} aria-label={title}>
                      <SelectValue placeholder="请选择" />
                    </SelectTrigger>
                    <SelectContent>
                      {prop.enum!.map((item) => (
                        <SelectItem key={String(item)} value={String(item)}>
                          {String(item)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {error && <p className="text-xs text-danger">{error}</p>}
            </label>
          )
        }

        const isNumber = prop.type === 'integer' || prop.type === 'number'
        return (
          <label key={key} className="block space-y-1">
            <span className="text-xs text-muted">
              {title}
              {isRequired ? <span className="text-danger"> *</span> : null}
            </span>
            <Controller
              name={key}
              control={control}
              render={({ field }) => (
                <Input
                  type={isNumber ? 'number' : 'text'}
                  value={field.value === undefined || field.value === null ? '' : String(field.value)}
                  min={prop.minimum}
                  max={prop.maximum}
                  step={prop.type === 'integer' ? 1 : isNumber ? 'any' : undefined}
                  aria-invalid={!!error}
                  aria-label={title}
                  onChange={(e) => {
                    const raw = e.target.value
                    if (!isNumber) {
                      field.onChange(raw)
                      return
                    }
                    if (raw === '') {
                      // Keep empty as NaN so z.number() fails clearly (not undefined).
                      field.onChange(Number.NaN)
                      return
                    }
                    const n = prop.type === 'integer' ? parseInt(raw, 10) : Number(raw)
                    field.onChange(Number.isFinite(n) ? n : Number.NaN)
                  }}
                />
              )}
            />
            {error && <p className="text-xs text-danger">{error}</p>}
          </label>
        )
      })}
    </div>
  )
}
