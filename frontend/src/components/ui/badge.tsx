import { cva, type VariantProps } from 'class-variance-authority'
import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

const badgeVariants = cva('inline-flex items-center border font-medium', {
  variants: {
    family: {
      /** 任务/健康等状态：圆角稍大、语义色 */
      status: 'rounded-md px-2 py-0.5 text-xs',
      /** 标签/分类：更克制的描边胶囊 */
      tag: 'rounded px-1.5 py-0.5 text-xs',
    },
    variant: {
      default: 'bg-brand/15 text-brand border-brand/30',
      secondary: 'bg-surface-2 text-muted border-border',
      success: 'bg-success/15 text-success border-success/30',
      warning: 'bg-warning/15 text-warning border-warning/30',
      danger: 'bg-danger/15 text-danger border-danger/30',
      info: 'bg-info/15 text-info border-info/30',
    },
  },
  defaultVariants: {
    family: 'status',
    variant: 'default',
  },
})

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, family, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ family, variant }), className)} {...props} />
}

export { badgeVariants }
