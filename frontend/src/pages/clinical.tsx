import { Link } from 'react-router-dom'
import { FileText, Stethoscope } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function ClinicalPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="临床应用"
        description="结构化报告与 DICOM 标准化导出（SEG / SR-TID1500 / GSPS）"
      />

      <div className="max-w-2xl space-y-4">
        <div className="rounded-lg border border-border bg-surface-1 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-fg-strong">
            <FileText className="h-4 w-4" />
            报告工作流已接入阅片器
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            在阅片页运行推理后，于右侧 AI 面板勾选 Findings，生成中文结构化报告，并可下载 DICOM
            SEG（掩膜）、SR-TID1500（测量）与 GSPS（检出框）。导出对象通过 Contributing Equipment
            写入模型身份。
          </p>
          <div className="mt-4">
            <Link to="/data" className={cn(buttonVariants())}>
              从数据中心打开检查
            </Link>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface-0 p-4 text-sm text-muted">
          <div className="mb-2 flex items-center gap-2 font-medium text-fg">
            <Stethoscope className="h-4 w-4" />
            API
          </div>
          <code className="text-xs text-fg">POST /api/v1/tasks/{'{task_id}'}/reports</code>
          <p className="mt-2 text-xs leading-relaxed">
            请求体支持 finding_ids、export_seg、export_sr、export_gsps；产物经既有 artifacts
            下载接口获取。
          </p>
        </div>
      </div>
    </div>
  )
}
