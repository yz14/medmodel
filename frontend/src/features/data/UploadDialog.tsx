import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Upload, Sparkles } from 'lucide-react'
import { api } from '@/lib/api'
import { errorMessage } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { toast } from '@/components/ui/sonner'
import { formatBytes, validateUploadFiles } from '@/features/data/uploadSchema'

export function UploadDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const [files, setFiles] = useState<File[]>([])
  const [progress, setProgress] = useState(0)
  const [canRetry, setCanRetry] = useState(false)
  const queryClient = useQueryClient()

  const resetLocal = () => {
    setFiles([])
    setProgress(0)
    setCanRetry(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  useEffect(() => {
    if (open) return
    abortRef.current?.abort()
    abortRef.current = null
    resetLocal()
  }, [open])

  const pickFiles = (list: FileList | File[] | null) => {
    const next = Array.from(list ?? [])
    setFiles(next)
    setProgress(0)
    setCanRetry(false)
    if (!next.length) return
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

  const seedMutation = useMutation({
    mutationFn: api.seedDemo,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['studies'] })
      void queryClient.invalidateQueries({ queryKey: ['overview'] })
      toast.success('演示数据已生成')
      onOpenChange(false)
    },
    onError: (err) => toast.error(errorMessage(err, '生成失败')),
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

  const busy = uploadMutation.isPending || seedMutation.isPending
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
      <DialogContent title="上传 DICOM / ZIP" onClose={() => onOpenChange(false)}>
        <div className="space-y-4">
          <button
            type="button"
            className="flex w-full flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface-0 px-4 py-10 text-center hover:bg-surface-2 disabled:opacity-60"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              if (busy) return
              pickFiles(e.dataTransfer.files)
            }}
          >
            <Upload className="mb-2 h-6 w-6 text-brand" />
            <div className="text-sm text-fg-strong">拖拽文件到此处，或点击选择</div>
            <div className="mt-1 text-xs text-muted">支持 .dcm / .zip 多文件</div>
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".dcm,.zip,application/dicom,application/zip"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              pickFiles(e.target.files)
            }}
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
                  <div key={`${f.name}-${f.size}-${f.lastModified}`}>{f.name}</div>
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
          <div className="flex flex-wrap gap-2">
            <Button disabled={!files.length || busy} onClick={startUpload}>
              {uploadMutation.isPending ? '上传中…' : '开始上传'}
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              data-testid="seed-demo"
              onClick={() => seedMutation.mutate()}
            >
              <Sparkles className="h-4 w-4" />
              {seedMutation.isPending ? '生成中…' : '生成演示数据'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
