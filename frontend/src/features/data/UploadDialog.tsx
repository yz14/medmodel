import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { FolderOpen, Upload } from 'lucide-react'
import { api } from '@/lib/api'
import { errorMessage } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { toast } from '@/components/ui/sonner'
import { collectFilesFromDataTransfer } from '@/features/data/collectDroppedFiles'
import {
  filterUploadCandidates,
  formatBytes,
  UPLOAD_LIMIT_HINT,
  uploadDisplayName,
  validateUploadFiles,
} from '@/features/data/uploadSchema'

export function UploadDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const [files, setFiles] = useState<File[]>([])
  const [progress, setProgress] = useState(0)
  const [canRetry, setCanRetry] = useState(false)
  const [dragging, setDragging] = useState(false)
  const queryClient = useQueryClient()

  const resetLocal = () => {
    setFiles([])
    setProgress(0)
    setCanRetry(false)
    setDragging(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (folderInputRef.current) folderInputRef.current.value = ''
  }

  useEffect(() => {
    if (open) return
    abortRef.current?.abort()
    abortRef.current = null
    resetLocal()
  }, [open])

  const pickFiles = (list: FileList | File[] | null, { fromFolder = false } = {}) => {
    const raw = Array.from(list ?? [])
    const next = filterUploadCandidates(raw)
    setFiles(next)
    setProgress(0)
    setCanRetry(false)
    if (!raw.length) return
    if (!next.length) {
      toast.error(fromFolder ? '文件夹中未找到 DICOM 或 ZIP' : '请选择 DICOM 或 ZIP 文件')
      return
    }
    if (next.length < raw.length) {
      toast.message(`已忽略 ${raw.length - next.length} 个非影像文件`)
    }
    const check = validateUploadFiles(next)
    if (!check.ok) toast.error(check.message)
  }

  const uploadMutation = useMutation({
    mutationFn: (payload: File[]) => {
      abortRef.current?.abort()
      const ac = new AbortController()
      abortRef.current = ac
      return api.uploadStudies(payload, {
        onProgress: (r) => setProgress(Math.round(r * 100)),
        signal: ac.signal,
      })
    },
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ['studies'] })
      void queryClient.invalidateQueries({ queryKey: ['overview'] })
      resetLocal()
      toast.success(res.total > 0 ? `上传完成，入库 ${res.total} 个检查` : '上传完成')
      onOpenChange(false)
    },
    onError: (err) => {
      const msg = errorMessage(err, '上传失败')
      if (msg === '已取消') return
      setCanRetry(true)
      toast.error(msg)
    },
    onSettled: () => {
      abortRef.current = null
    },
  })

  const startUpload = () => {
    const check = validateUploadFiles(files)
    if (!check.ok) {
      toast.error(check.message)
      return
    }
    setCanRetry(false)
    setProgress(0)
    uploadMutation.mutate(files)
  }

  const busy = uploadMutation.isPending
  const totalBytes = files.reduce((s, f) => s + f.size, 0)

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && uploadMutation.isPending) {
          abortRef.current?.abort()
        }
        onOpenChange(v)
      }}
    >
      <DialogContent title="上传影像" onClose={() => onOpenChange(false)}>
        <div className="space-y-4">
          <div
            className={`flex w-full flex-col items-center justify-center rounded-xl border border-dashed px-4 py-8 text-center transition-colors ${
              dragging
                ? 'border-brand bg-brand/5'
                : 'border-border bg-surface-0 hover:bg-surface-2'
            } ${busy ? 'pointer-events-none opacity-60' : ''}`}
            onDragEnter={(e) => {
              e.preventDefault()
              if (!busy) setDragging(true)
            }}
            onDragOver={(e) => e.preventDefault()}
            onDragLeave={(e) => {
              e.preventDefault()
              if (e.currentTarget.contains(e.relatedTarget as Node)) return
              setDragging(false)
            }}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              if (busy) return
              void collectFilesFromDataTransfer(e.dataTransfer).then((list) =>
                pickFiles(list, { fromFolder: true }),
              )
            }}
          >
            <Upload className="mb-2 h-6 w-6 text-brand" />
            <div className="text-sm text-fg-strong">拖拽文件或文件夹到此处</div>
            <div className="mt-1 text-xs text-muted">支持 .dcm / .dicom / .zip，以及无扩展名 DICOM</div>
            <div className="mt-1 text-xs text-muted">{UPLOAD_LIMIT_HINT}</div>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-3.5 w-3.5" />
                选择文件 / ZIP
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() => folderInputRef.current?.click()}
              >
                <FolderOpen className="h-3.5 w-3.5" />
                选择文件夹
              </Button>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".dcm,.dicom,.zip,application/dicom,application/zip"
            className="hidden"
            disabled={busy}
            onChange={(e) => pickFiles(e.target.files)}
          />
          <input
            ref={(el) => {
              folderInputRef.current = el
              if (el) {
                el.setAttribute('webkitdirectory', '')
                el.setAttribute('directory', '')
              }
            }}
            type="file"
            multiple
            className="hidden"
            disabled={busy}
            onChange={(e) => pickFiles(e.target.files, { fromFolder: true })}
          />

          {files.length > 0 && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted">
                <span>
                  已选 {files.length} 个文件 · {formatBytes(totalBytes)}
                </span>
                <button
                  type="button"
                  className="text-brand hover:underline disabled:opacity-50"
                  disabled={busy}
                  onClick={resetLocal}
                >
                  清空
                </button>
              </div>
              <div className="max-h-32 overflow-auto rounded-lg border border-border bg-surface-0 p-2 text-xs text-muted">
                {files.map((f) => (
                  <div key={`${uploadDisplayName(f)}-${f.size}-${f.lastModified}`}>
                    {uploadDisplayName(f)}
                  </div>
                ))}
              </div>
            </div>
          )}
          {uploadMutation.isPending && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted">
                <span>上传进度</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress / 100} />
            </div>
          )}
          {canRetry && files.length > 0 && !uploadMutation.isPending && (
            <Button variant="outline" size="sm" onClick={startUpload}>
              重试上传
            </Button>
          )}
          <Button disabled={!files.length || busy} onClick={startUpload}>
            {uploadMutation.isPending ? '上传中…' : '开始上传'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
