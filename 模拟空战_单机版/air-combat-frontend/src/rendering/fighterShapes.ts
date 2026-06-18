import type { FighterType } from '../game/types'

export type FighterTeamStyle = {
  fill: string
  stroke: string
}

type CanvasDraw = (ctx: CanvasRenderingContext2D, style: FighterTeamStyle) => void

const kjBody = new Path2D()
kjBody.ellipse(0, 0, 16, 7, 0, 0, Math.PI * 2)
const kjRing = new Path2D()
kjRing.arc(0, 0, 20, 0, Math.PI * 2)

const j20 = new Path2D()
j20.moveTo(18, 0)
j20.lineTo(0, 9)
j20.lineTo(-8, 12)
j20.lineTo(-12, 4)
j20.lineTo(-8, 0)
j20.lineTo(-12, -4)
j20.lineTo(-8, -12)
j20.lineTo(0, -9)
j20.closePath()

const j16Body = new Path2D()
j16Body.moveTo(14, 0)
j16Body.lineTo(2, 13)
j16Body.lineTo(-10, 10)
j16Body.lineTo(-12, 4)
j16Body.lineTo(-12, -4)
j16Body.lineTo(-10, -10)
j16Body.lineTo(2, -13)
j16Body.closePath()
const j16RectLo = new Path2D()
j16RectLo.rect(-9, 4, 8, 3)
const j16RectHi = new Path2D()
j16RectHi.rect(-9, -7, 8, 3)

const j10c = new Path2D()
j10c.moveTo(16, 0)
j10c.lineTo(6, 7)
j10c.lineTo(-2, 12)
j10c.lineTo(-10, 6)
j10c.lineTo(-10, -6)
j10c.lineTo(-2, -12)
j10c.lineTo(6, -7)
j10c.closePath()

const j25Body = new Path2D()
j25Body.moveTo(20, 0)
j25Body.lineTo(4, 10)
j25Body.lineTo(-10, 16)
j25Body.lineTo(-14, 0)
j25Body.lineTo(-10, -16)
j25Body.lineTo(4, -10)
j25Body.closePath()
const j25CenterLine = new Path2D()
j25CenterLine.moveTo(18, 0)
j25CenterLine.lineTo(-12, 0)

const genericBody = new Path2D()
genericBody.moveTo(14, 0)
genericBody.lineTo(-8, 10)
genericBody.lineTo(-5, 0)
genericBody.lineTo(-8, -10)
genericBody.closePath()

const drawerByModel = new Map<string, CanvasDraw>([
  [
    'KJ-500',
    (ctx, style) => {
      ctx.fillStyle = style.fill
      ctx.strokeStyle = style.stroke
      ctx.lineWidth = 1.5
      ctx.fill(kjBody)
      ctx.stroke(kjBody)
      ctx.strokeStyle = 'rgba(146, 235, 255, 0.9)'
      ctx.lineWidth = 1.2
      ctx.stroke(kjRing)
    },
  ],
  [
    'J-20',
    (ctx, style) => {
      ctx.fillStyle = style.fill
      ctx.strokeStyle = style.stroke
      ctx.lineWidth = 1.5
      ctx.fill(j20)
      ctx.stroke(j20)
    },
  ],
  [
    'J-16',
    (ctx, style) => {
      ctx.fillStyle = style.fill
      ctx.strokeStyle = style.stroke
      ctx.lineWidth = 1.5
      ctx.fill(j16Body)
      ctx.stroke(j16Body)
      ctx.fillStyle = style.fill
      ctx.fill(j16RectLo)
      ctx.fill(j16RectHi)
    },
  ],
  [
    'J-10C',
    (ctx, style) => {
      ctx.fillStyle = style.fill
      ctx.strokeStyle = style.stroke
      ctx.lineWidth = 1.5
      ctx.fill(j10c)
      ctx.stroke(j10c)
    },
  ],
  [
    'J-25',
    (ctx, style) => {
      ctx.fillStyle = style.fill
      ctx.strokeStyle = style.stroke
      ctx.lineWidth = 1.5
      ctx.fill(j25Body)
      ctx.stroke(j25Body)
      ctx.strokeStyle = 'rgba(255,255,255,0.18)'
      ctx.lineWidth = 0.8
      ctx.stroke(j25CenterLine)
    },
  ],
])

drawerByModel.set(
  'default',
  (ctx, style) => {
    ctx.fillStyle = style.fill
    ctx.strokeStyle = style.stroke
    ctx.lineWidth = 1.5
    ctx.fill(genericBody)
    ctx.stroke(genericBody)
  },
)

function drawerForModel(model: string): CanvasDraw {
  const d = drawerByModel.get(model)
  if (d) return d
  return drawerByModel.get('default')!
}

/** Canvas: draw silhouette at origin, nose toward +x. Caller wraps with translate(position) + rotate(heading). */
export function drawFighterModelOnCanvas(
  ctx: CanvasRenderingContext2D,
  model: string,
  style: FighterTeamStyle,
): void {
  drawerForModel(model)(ctx, style)
}

/** HUD SVG viewBox aligned with fighter-local coordinates (approx. same as canvas). */
export const FIGHTER_LEGEND_VIEWBOX = '-22 -18 44 36'

/** Neutral legend colors (readable on dark HUD; silhouette matches map geometry). */
export const FIGHTER_LEGEND_NEUTRAL: FighterTeamStyle = {
  fill: 'rgba(142, 216, 255, 0.35)',
  stroke: 'rgba(190, 230, 255, 0.92)',
}

export type HudLegendFragments = readonly (
  | { kind: 'path'; d: string; fillOpacity?: number; strokeWidth?: number }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number; opacity?: number; strokeWidth?: number }
  | { kind: 'rect'; x: number; y: number; width: number; height: number }
)[]

/** SVG fragments mirroring canvas paths at origin (fighter types shown in HUD). */
export function hudLegendFragmentsForModel(model: FighterType): HudLegendFragments {
  switch (model) {
    case 'J-20':
      return [
        {
          kind: 'path',
          d: 'M 18,0 L 0,9 L -8,12 L -12,4 L -8,0 L -12,-4 L -8,-12 L 0,-9 Z',
        },
      ]
    case 'J-16':
      return [
        {
          kind: 'path',
          d: 'M 14,0 L 2,13 L -10,10 L -12,4 L -12,-4 L -10,-10 L 2,-13 Z',
        },
        { kind: 'rect', x: -9, y: 4, width: 8, height: 3 },
        { kind: 'rect', x: -9, y: -7, width: 8, height: 3 },
      ]
    case 'J-10C':
      return [
        {
          kind: 'path',
          d: 'M 16,0 L 6,7 L -2,12 L -10,6 L -10,-6 L -2,-12 L 6,-7 Z',
        },
      ]
    case 'J-25':
      return [
        {
          kind: 'path',
          d: 'M 20,0 L 4,10 L -10,16 L -14,0 L -10,-16 L 4,-10 Z',
        },
        {
          kind: 'line',
          x1: 18,
          y1: 0,
          x2: -12,
          y2: 0,
          opacity: 0.35,
          strokeWidth: 0.8,
        },
      ]
    default:
      return [
        {
          kind: 'path',
          d: 'M 14,0 L -8,10 L -5,0 L -8,-10 Z',
        },
      ]
  }
}
