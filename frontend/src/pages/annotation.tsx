import { PenLine } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'

export function AnnotationPage() {
  return (
    <div>
      <PageHeader title="标注质控" description="标注工具与质控流程（规划中）" />
      <EmptyState
        icon={<PenLine className="h-5 w-5" />}
        title="标注质控即将推出"
        description="本模块将支持 ROI 标注、一致性校验与专家复核，MVP 阶段仅作占位。"
      />
    </div>
  )
}
