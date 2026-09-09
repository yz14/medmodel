import { z } from 'zod'

/** Mirror backend defaults (app.infra.config). */
export const MAX_UPLOAD_FILES = 500
export const MAX_UPLOAD_BYTES = 512 * 1024 * 1024

function fileLooksAllowed(file: File): boolean {
  const name = file.name.toLowerCase()
  if (name.endsWith('.dcm') || name.endsWith('.zip')) return true
  const t = (file.type || '').toLowerCase()
  return (
    t === 'application/dicom' ||
    t === 'application/zip' ||
    t === 'application/x-zip-compressed' ||
    t.includes('dicom')
  )
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

export const uploadFilesSchema = z
  .array(z.custom<File>((v) => typeof File !== 'undefined' && v instanceof File))
  .min(1, '请先选择 DICOM 或 ZIP 文件')
  .max(MAX_UPLOAD_FILES, `文件数超过限制（最多 ${MAX_UPLOAD_FILES} 个）`)
  .superRefine((files, ctx) => {
    const total = files.reduce((sum, f) => sum + f.size, 0)
    if (total <= 0) {
      ctx.addIssue({ code: 'custom', message: '所选文件为空' })
      return
    }
    if (total > MAX_UPLOAD_BYTES) {
      ctx.addIssue({
        code: 'custom',
        message: `总大小超过限制（最多 ${formatBytes(MAX_UPLOAD_BYTES)}）`,
      })
    }
    for (const f of files) {
      if (!fileLooksAllowed(f)) {
        ctx.addIssue({
          code: 'custom',
          message: `不支持的文件类型：${f.name || '未命名'}`,
        })
      }
    }
  })

export function validateUploadFiles(files: File[]): { ok: true } | { ok: false; message: string } {
  const parsed = uploadFilesSchema.safeParse(files)
  if (parsed.success) return { ok: true }
  const first = parsed.error.issues[0]
  return { ok: false, message: first?.message || '文件校验失败' }
}
