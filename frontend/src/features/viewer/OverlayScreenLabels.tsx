import { imageToScreen, pixelDistanceMm, type Camera2D } from '@/features/viewer/core'
import { detectionColor } from '@/features/viewer/core/overlayStyle'
import { findingLabelZh } from '@/features/viewer/findingLabels'
import type { LengthMeasurement } from '@/stores/viewer-store'
import type { DetectionBox } from '@/types/api'

const chipClass =
  'pointer-events-none absolute -translate-y-full whitespace-nowrap rounded bg-black/55 px-1.5 py-0.5 text-[11px] font-medium leading-none text-white shadow-sm backdrop-blur-[2px]'

/**
 * Screen-space labels for detections / measurements (#3).
 * Geometry stays in the image-space SVG; chips here keep constant size.
 */
export function OverlayScreenLabels({
  camera,
  imageW,
  imageH,
  flipH,
  flipV,
  boxes,
  measurements,
  selectedMeasurementId,
  spacing,
}: {
  camera: Camera2D
  imageW: number
  imageH: number
  flipH: boolean
  flipV: boolean
  boxes: DetectionBox[]
  measurements: LengthMeasurement[]
  selectedMeasurementId?: string | null
  spacing?: Array<number | null> | null
}) {
  const map = (ix: number, iy: number) =>
    imageToScreen(camera, ix, iy, imageW, imageH, flipH, flipV)

  return (
    <div className="pointer-events-none absolute inset-0 z-[15] overflow-hidden">
      {boxes.map((box, bi) => {
        const bbox = box.bbox
        if (!bbox || bbox.length < 4) return null
        const [x, y] = bbox
        const color = detectionColor(box.label, bi)
        // Place chip at top-left outside the box
        const p = map(x!, Math.max(0, y! - 2))
        return (
          <div
            key={box.id}
            className={chipClass}
            style={{
              left: p.x,
              top: p.y,
              borderLeft: `2px solid ${color}`,
              color: '#fff',
            }}
          >
            <span style={{ color }}>{findingLabelZh(box.label)}</span>
            <span className="ml-1 tabular-nums text-white/80">
              {(box.confidence * 100).toFixed(0)}%
            </span>
          </div>
        )
      })}

      {measurements.map((m) => {
        const dist = pixelDistanceMm(m.x1, m.y1, m.x2, m.y2, spacing)
        const mid = map((m.x1 + m.x2) / 2, (m.y1 + m.y2) / 2)
        const selected = selectedMeasurementId === m.id
        return (
          <div
            key={m.id}
            className={chipClass}
            style={{
              left: mid.x,
              top: mid.y,
              transform: 'translate(-50%, -120%)',
              borderLeft: selected ? '2px solid #fbbf24' : '2px solid #38BDF8',
            }}
          >
            <span className="tabular-nums text-sky-200">{dist.toFixed(1)} mm</span>
            {selected && <span className="ml-1 text-white/50">删除</span>}
          </div>
        )
      })}
    </div>
  )
}
