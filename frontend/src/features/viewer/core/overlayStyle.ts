/** Detection / finding color palette (FE-3). Backend boxes may omit color. */

const PALETTE = [
  '#F59E0B', // amber
  '#38BDF8', // sky
  '#A78BFA', // violet
  '#34D399', // emerald
  '#F472B6', // pink
  '#FB7185', // rose
  '#2DD4BF', // teal
  '#FBBF24', // yellow
] as const

export function detectionColor(label: string, index = 0): string {
  let h = 0
  for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) >>> 0
  return PALETTE[(h + index) % PALETTE.length]!
}

export function parseCssRgb(color: string): [number, number, number] {
  if (color.startsWith('#') && (color.length === 7 || color.length === 4)) {
    if (color.length === 4) {
      return [
        parseInt(color[1]! + color[1]!, 16),
        parseInt(color[2]! + color[2]!, 16),
        parseInt(color[3]! + color[3]!, 16),
      ]
    }
    return [
      parseInt(color.slice(1, 3), 16),
      parseInt(color.slice(3, 5), 16),
      parseInt(color.slice(5, 7), 16),
    ]
  }
  return [56, 189, 248]
}
