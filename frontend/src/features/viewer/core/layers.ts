/**
 * Viewer layer stack (FE-2). Rendering stays in StackViewport;
 * this module is the visibility / opacity / z-order contract.
 */

export type LayerKind = 'image' | 'mask' | 'cam' | 'annotation' | 'overlay'

export interface ViewerLayer {
  id: LayerKind
  label: string
  visible: boolean
  /** 0–1; image layer is always drawn opaque. */
  opacity: number
  /** Lower draws first. */
  order: number
}

export interface LayerFlags {
  showMasks: boolean
  showBoxes: boolean
  showAnnotations: boolean
  showCam: boolean
  maskOpacity: number
  camOpacity: number
}

const LAYER_META: Record<LayerKind, { label: string; order: number }> = {
  image: { label: '影像', order: 0 },
  mask: { label: '分割掩膜', order: 1 },
  cam: { label: 'CAM 热图', order: 2 },
  overlay: { label: '检测框', order: 3 },
  annotation: { label: '测量', order: 4 },
}

export function buildViewerLayers(flags: LayerFlags): ViewerLayer[] {
  return (Object.keys(LAYER_META) as LayerKind[]).map((id) => {
    const meta = LAYER_META[id]
    if (id === 'image') {
      return { id, label: meta.label, visible: true, opacity: 1, order: meta.order }
    }
    if (id === 'mask') {
      return {
        id,
        label: meta.label,
        visible: flags.showMasks,
        opacity: flags.maskOpacity,
        order: meta.order,
      }
    }
    if (id === 'cam') {
      return {
        id,
        label: meta.label,
        visible: flags.showCam,
        opacity: flags.camOpacity,
        order: meta.order,
      }
    }
    if (id === 'overlay') {
      return {
        id,
        label: meta.label,
        visible: flags.showBoxes,
        opacity: 1,
        order: meta.order,
      }
    }
    return {
      id,
      label: meta.label,
      visible: flags.showAnnotations,
      opacity: 1,
      order: meta.order,
    }
  })
}

export function layerById(layers: ViewerLayer[], id: LayerKind): ViewerLayer | undefined {
  return layers.find((l) => l.id === id)
}

export function isLayerVisible(layers: ViewerLayer[], id: LayerKind): boolean {
  return layerById(layers, id)?.visible ?? false
}
