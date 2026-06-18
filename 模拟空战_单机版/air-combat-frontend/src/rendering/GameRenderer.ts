import type { BattleSnapshot, FighterState, Team } from '../game/types'
import { drawFighterModelOnCanvas } from './fighterShapes'

interface RenderOptions {
  fps: number
  playerId: string
}

const MINIMAP_RADIUS = 88
const MINIMAP_X = 1200 - MINIMAP_RADIUS - 14
const MINIMAP_Y = MINIMAP_RADIUS + 14

/** Main-map sweep matches tick; minimap sweep updated every N ticks to improve dirty hit rate. */
const MINIMAP_SWEEP_TICK_STEP = 2

/** HUD 中 FPS 文本刷新间隔（渲染帧数），避免每帧因 FPS 变化导致 HUD 恒脏。 */
const HUD_FPS_REFRESH_FRAMES = 4

/** 底栏 HUD 占用高度；世界层 clip 掉这条带，合成时该带透明以保留上一帧 HUD（脏矩形）。 */
const HUD_STRIP_PX = 50

function create2dBuffer(
  width: number,
  height: number,
): { canvas: HTMLCanvasElement | OffscreenCanvas; ctx: CanvasRenderingContext2D } {
  try {
    if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(width, height)
      const octx = canvas.getContext('2d')
      if (octx) {
        return { canvas, ctx: octx as unknown as CanvasRenderingContext2D }
      }
    }
  } catch {
    // Offscreen 不可用时回退到 DOM canvas
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable')
  }
  return { canvas, ctx }
}

export class GameRenderer {
  private readonly displayCtx: CanvasRenderingContext2D
  /** 当前绘制目标：在 render 各阶段切换 world / minimap 缓存。 */
  private activeCtx: CanvasRenderingContext2D
  private readonly worldCtx: CanvasRenderingContext2D
  private readonly worldBuffer: HTMLCanvasElement | OffscreenCanvas
  private readonly minimapCtx: CanvasRenderingContext2D
  private readonly minimapBuffer: HTMLCanvasElement | OffscreenCanvas
  private readonly width: number
  private readonly height: number
  private readonly minimapCacheW: number
  private readonly minimapCacheH: number
  private readonly minimapLocalCx: number
  private readonly minimapLocalCy: number

  private hudFrameCount = 0
  private hudFpsDisplayed = 0
  private lastHudSig = ''
  private lastMinimapSig = ''

  constructor(displayCtx: CanvasRenderingContext2D, width: number, height: number) {
    this.displayCtx = displayCtx
    this.width = width
    this.height = height

    const { canvas: worldBuffer, ctx: worldCtx } = create2dBuffer(width, height)
    this.worldBuffer = worldBuffer
    this.worldCtx = worldCtx

    const pad = 2
    const labelBelow = 22
    const r = MINIMAP_RADIUS
    this.minimapLocalCx = r + pad
    this.minimapLocalCy = r + pad
    this.minimapCacheW = r * 2 + pad * 2
    this.minimapCacheH = r * 2 + pad * 2 + labelBelow
    const { canvas: miniBuf, ctx: miniCtx } = create2dBuffer(this.minimapCacheW, this.minimapCacheH)
    this.minimapBuffer = miniBuf
    this.minimapCtx = miniCtx

    this.activeCtx = this.worldCtx
  }

  /** One or two passes over fighters (avoids repeated O(n) .find per frame). */
  private resolvePlayerAndAwacs(snapshot: BattleSnapshot, playerId: string): {
    player?: FighterState
    awacs?: FighterState
  } {
    const fighters = snapshot.fighters
    let player: FighterState | undefined
    for (let i = 0; i < fighters.length; i++) {
      if (fighters[i].id === playerId) {
        player = fighters[i]
        break
      }
    }
    const team: Team = player?.team ?? 'RED'
    let awacs: FighterState | undefined
    for (let i = 0; i < fighters.length; i++) {
      const f = fighters[i]
      if (f.alive && f.model === 'KJ-500' && f.team === team) {
        awacs = f
        break
      }
    }
    return { player, awacs }
  }

  private computeHudSignature(
    snapshot: BattleSnapshot,
    player: FighterState | undefined,
    fpsShown: number,
  ): string {
    const missileText = !player ? '-' : player.infiniteMissiles ? '∞' : String(player.missileCount)
    const bombText = player ? String(player.bombCount) : '-'
    return [
      fpsShown,
      snapshot.redAlive,
      snapshot.blueAlive,
      player?.hp ?? '-',
      player ? Math.round(player.speed) : '-',
      missileText,
      bombText,
    ].join('|')
  }

  private computeMinimapSignature(
    snapshot: BattleSnapshot,
    awacs: FighterState,
    range: number,
  ): string {
    if (range <= 0) {
      return 'offline'
    }
    const sweepB = Math.floor(snapshot.tick / MINIMAP_SWEEP_TICK_STEP)
    const marks = snapshot.radarMarks
      .map((m) => `${m.position.x.toFixed(0)},${m.position.y.toFixed(0)}`)
      .join(';')
    let fr = ''
    for (const fighter of snapshot.fighters) {
      if (!fighter.alive || fighter.team !== awacs.team) {
        continue
      }
      fr += `${fighter.id}:${fighter.position.x.toFixed(0)},${fighter.position.y.toFixed(0)}|`
    }
    return [
      range.toFixed(1),
      awacs.position.x.toFixed(1),
      awacs.position.y.toFixed(1),
      sweepB,
      marks,
      fr,
    ].join('|')
  }

  render(snapshot: BattleSnapshot, options: RenderOptions): void {
    const vp = snapshot.viewport
    const { player, awacs } = this.resolvePlayerAndAwacs(snapshot, options.playerId)

    // === World layer → offscreen（双缓冲）；底部 HUD 带不绘制，合成时为透明，便于 HUD 脏矩形保留像素 ===
    this.activeCtx = this.worldCtx
    this.activeCtx.setTransform(1, 0, 0, 1, 0, 0)
    this.activeCtx.clearRect(0, 0, this.width, this.height)
    this.activeCtx.save()
    this.activeCtx.beginPath()
    this.activeCtx.rect(0, 0, this.width, this.height - HUD_STRIP_PX)
    this.activeCtx.clip()
    this.activeCtx.translate(-vp.x, -vp.y)

    this.drawBackground(vp.x, vp.y, vp.width, vp.height)
    this.drawSeaGrid(snapshot.tick, vp)
    this.drawAwacsRadarCircle(snapshot, awacs)
    this.drawRadarMarks(snapshot)
    this.drawBombs(snapshot)
    this.drawMissiles(snapshot)
    this.drawFighters(snapshot)
    this.drawHealthBars(snapshot)
    this.drawDamagePopups(snapshot)

    this.activeCtx.restore()

    // === Composite to display ===
    this.displayCtx.drawImage(this.worldBuffer as CanvasImageSource, 0, 0)

    // === HUD：脏矩形（仅内容变化时重画底栏）===
    this.hudFrameCount++
    if (this.hudFrameCount % HUD_FPS_REFRESH_FRAMES === 0) {
      this.hudFpsDisplayed = options.fps
    }
    const hudSig = this.computeHudSignature(snapshot, player, this.hudFpsDisplayed)
    if (hudSig !== this.lastHudSig) {
      this.lastHudSig = hudSig
      this.activeCtx = this.displayCtx
      this.drawHudOverlay(snapshot, this.hudFpsDisplayed, player)
    }

    // === Minimap：离屏缓存 + 脏标记 ===
    if (!awacs) {
      this.lastMinimapSig = ''
      return
    }

    const range = snapshot.awacsRadarRange
    const mmSig = this.computeMinimapSignature(snapshot, awacs, range)
    if (mmSig !== this.lastMinimapSig) {
      this.lastMinimapSig = mmSig
      this.activeCtx = this.minimapCtx
      this.activeCtx.setTransform(1, 0, 0, 1, 0, 0)
      this.activeCtx.clearRect(0, 0, this.minimapCacheW, this.minimapCacheH)
      const lcx = this.minimapLocalCx
      const lcy = this.minimapLocalCy
      const r = MINIMAP_RADIUS
      if (range <= 0) {
        this.drawRadarOfflineAt(lcx, lcy, r)
      } else {
        this.drawRadarMinimapAt(snapshot, awacs, range, lcx, lcy, r)
      }
    }

    this.displayCtx.drawImage(
      this.minimapBuffer as CanvasImageSource,
      MINIMAP_X - this.minimapLocalCx,
      MINIMAP_Y - this.minimapLocalCy,
    )
  }

  private drawBackground(camX: number, camY: number, vw: number, vh: number): void {
    const gradient = this.activeCtx.createLinearGradient(camX, camY, camX, camY + vh)
    gradient.addColorStop(0, '#02142f')
    gradient.addColorStop(0.45, '#022347')
    gradient.addColorStop(1, '#03152a')
    this.activeCtx.fillStyle = gradient
    this.activeCtx.fillRect(camX, camY, vw, vh)
  }

  private drawSeaGrid(tick: number, vp: { x: number; y: number; width: number; height: number }): void {
    this.activeCtx.save()
    const gridStep = 80
    const startX = Math.floor(vp.x / gridStep) * gridStep
    const endX = vp.x + vp.width + gridStep
    const startY = Math.floor(vp.y / gridStep) * gridStep
    const endY = vp.y + vp.height + gridStep

    this.activeCtx.strokeStyle = 'rgba(88, 160, 230, 0.08)'
    this.activeCtx.lineWidth = 1
    this.activeCtx.beginPath()
    for (let x = startX; x <= endX; x += gridStep) {
      this.activeCtx.moveTo(x, vp.y)
      this.activeCtx.lineTo(x, vp.y + vp.height)
    }
    this.activeCtx.stroke()
    this.activeCtx.beginPath()
    for (let y = startY; y <= endY; y += gridStep) {
      this.activeCtx.moveTo(vp.x, y)
      this.activeCtx.lineTo(vp.x + vp.width, y)
    }
    this.activeCtx.stroke()

    // Animated wave lines：合并为单次 stroke，加大采样步长以降低顶点数
    this.activeCtx.strokeStyle = 'rgba(60, 140, 220, 0.18)'
    this.activeCtx.lineWidth = 1.2
    const phase = tick * 0.025
    const waveXStep = 28
    const waveRowStep = 120
    this.activeCtx.beginPath()
    for (let y = startY; y <= endY; y += waveRowStep) {
      for (let x = vp.x; x <= vp.x + vp.width; x += waveXStep) {
        const wave = y + Math.sin(x * 0.012 + phase + y * 0.025) * 5
        if (x === vp.x) {
          this.activeCtx.moveTo(x, wave)
        } else {
          this.activeCtx.lineTo(x, wave)
        }
      }
    }
    this.activeCtx.stroke()
    this.activeCtx.restore()
  }

  private drawAwacsRadarCircle(snapshot: BattleSnapshot, awacs: FighterState | undefined): void {
    if (!awacs || snapshot.awacsRadarRange <= 0) {
      return
    }

    this.activeCtx.save()
    // AWACS range ring
    this.activeCtx.strokeStyle = 'rgba(107, 227, 255, 0.45)'
    this.activeCtx.setLineDash([10, 10])
    this.activeCtx.lineWidth = 1.5
    this.activeCtx.beginPath()
    this.activeCtx.arc(awacs.position.x, awacs.position.y, snapshot.awacsRadarRange, 0, Math.PI * 2)
    this.activeCtx.stroke()

    // Rotating sweep line
    const sweepAngle = (snapshot.tick * 0.025) % (Math.PI * 2)
    this.activeCtx.setLineDash([])
    this.activeCtx.strokeStyle = 'rgba(98, 246, 255, 0.28)'
    this.activeCtx.lineWidth = 1.5
    this.activeCtx.beginPath()
    this.activeCtx.moveTo(awacs.position.x, awacs.position.y)
    this.activeCtx.lineTo(
      awacs.position.x + Math.cos(sweepAngle) * snapshot.awacsRadarRange,
      awacs.position.y + Math.sin(sweepAngle) * snapshot.awacsRadarRange,
    )
    this.activeCtx.stroke()
    this.activeCtx.restore()
  }

  private drawRadarMarks(snapshot: BattleSnapshot): void {
    this.activeCtx.save()
    this.activeCtx.strokeStyle = 'rgba(128, 245, 255, 0.75)'
    this.activeCtx.lineWidth = 1.3
    for (const mark of snapshot.radarMarks) {
      const size = 7
      this.activeCtx.beginPath()
      this.activeCtx.moveTo(mark.position.x - size, mark.position.y)
      this.activeCtx.lineTo(mark.position.x + size, mark.position.y)
      this.activeCtx.moveTo(mark.position.x, mark.position.y - size)
      this.activeCtx.lineTo(mark.position.x, mark.position.y + size)
      this.activeCtx.stroke()
    }
    this.activeCtx.restore()
  }

  private drawFighters(snapshot: BattleSnapshot): void {
    for (const fighter of snapshot.fighters) {
      if (!fighter.alive) {
        continue
      }
      this.drawFighterShape(fighter)
    }
  }

  private drawFighterShape(fighter: FighterState): void {
    const teamFill = fighter.team === 'RED' ? '#ff5f6d' : '#4f82ff'
    const teamStroke = fighter.team === 'RED' ? '#ff9ba3' : '#80bcff'

    this.activeCtx.save()
    this.activeCtx.translate(fighter.position.x, fighter.position.y)
    this.activeCtx.rotate(fighter.heading)
    drawFighterModelOnCanvas(this.activeCtx, fighter.model, {
      fill: teamFill,
      stroke: teamStroke,
    })

    this.activeCtx.restore()
  }

  private drawMissiles(snapshot: BattleSnapshot): void {
    this.activeCtx.save()
    for (const missile of snapshot.missiles) {
      if (!missile.alive) {
        continue
      }
      this.activeCtx.fillStyle = missile.team === 'RED' ? '#ffced3' : '#d5e4ff'
      this.activeCtx.beginPath()
      this.activeCtx.arc(missile.position.x, missile.position.y, 2.8, 0, Math.PI * 2)
      this.activeCtx.fill()
    }
    this.activeCtx.restore()
  }

  private drawBombs(snapshot: BattleSnapshot): void {
    this.activeCtx.save()
    for (const bomb of snapshot.bombs) {
      if (!bomb.alive) {
        continue
      }
      this.activeCtx.fillStyle = bomb.team === 'RED' ? '#ffa030' : '#a060ff'
      this.activeCtx.beginPath()
      this.activeCtx.arc(bomb.position.x, bomb.position.y, 4, 0, Math.PI * 2)
      this.activeCtx.fill()
      this.activeCtx.strokeStyle = bomb.team === 'RED' ? '#ffd090' : '#c090ff'
      this.activeCtx.lineWidth = 1.5
      this.activeCtx.beginPath()
      this.activeCtx.moveTo(bomb.position.x, bomb.position.y)
      this.activeCtx.lineTo(
        bomb.position.x + Math.cos(bomb.heading) * 10,
        bomb.position.y + Math.sin(bomb.heading) * 10,
      )
      this.activeCtx.stroke()
    }
    this.activeCtx.restore()
  }

  private drawHealthBars(snapshot: BattleSnapshot): void {
    this.activeCtx.save()
    for (const fighter of snapshot.fighters) {
      if (!fighter.alive) {
        continue
      }
      const barWidth = fighter.model === 'KJ-500' ? 30 : 24
      const barX = fighter.position.x - barWidth / 2
      const barY = fighter.position.y - 20
      const ratio = Math.max(0, Math.min(1, fighter.hp / fighter.maxHp))

      this.activeCtx.fillStyle = 'rgba(0, 0, 0, 0.38)'
      this.activeCtx.fillRect(barX, barY, barWidth, 4)

      this.activeCtx.fillStyle = fighter.team === 'RED' ? '#ff7680' : '#6ea9ff'
      this.activeCtx.fillRect(barX, barY, barWidth * ratio, 4)

      if (fighter.nickname) {
        const nameColor = fighter.team === 'RED' ? 'rgba(255, 200, 200, 0.95)' : 'rgba(180, 210, 255, 0.95)'
        this.activeCtx.fillStyle = nameColor
        this.activeCtx.font = 'bold 9px "Microsoft YaHei", "Consolas", sans-serif'
        this.activeCtx.textAlign = 'center'
        this.activeCtx.fillText(fighter.nickname, fighter.position.x, barY - 2)
      }
    }
    this.activeCtx.restore()
  }

  private drawDamagePopups(snapshot: BattleSnapshot): void {
    this.activeCtx.save()
    this.activeCtx.font = 'bold 14px "Consolas", "Microsoft YaHei", sans-serif'
    this.activeCtx.textAlign = 'center'
    for (const popup of snapshot.damagePopups) {
      const x = popup.position?.x
      const y = popup.position?.y
      if (x == null || y == null || Number.isNaN(x) || Number.isNaN(y)) {
        continue
      }
      const alpha = Math.max(0.15, Math.min(1, popup.ttlMs / 760))
      this.activeCtx.fillStyle =
        popup.team === 'RED' ? `rgba(255, 126, 126, ${alpha})` : `rgba(143, 198, 255, ${alpha})`
      this.activeCtx.fillText(`-${popup.damage}`, x, y - 16)
    }
    this.activeCtx.restore()
  }

  private drawHudOverlay(snapshot: BattleSnapshot, fps: number, player: FighterState | undefined): void {
    const missileText = !player ? '-' : player.infiniteMissiles ? '∞' : String(player.missileCount)
    const bombText = player ? String(player.bombCount) : '-'

    const text =
      `渲染FPS ${fps.toString().padStart(2, '0')} | 红方 ${snapshot.redAlive} 蓝方 ${snapshot.blueAlive}` +
      (player ? ` | 速 ${Math.round(player.speed)} | 血 ${player.hp} | 导弹 ${missileText} | 炸弹 ${bombText}` : '')

    this.activeCtx.save()
    this.activeCtx.fillStyle = 'rgba(4, 18, 34, 0.72)'
    this.activeCtx.fillRect(12, this.height - 44, Math.min(this.width - 24, text.length * 8.6 + 20), 30)
    this.activeCtx.fillStyle = '#8ed8ff'
    this.activeCtx.font = '13px "Consolas", "Microsoft YaHei", sans-serif'
    this.activeCtx.textAlign = 'left'
    this.activeCtx.fillText(text, 20, this.height - 22)
    this.activeCtx.restore()
  }

  /** 主地图右下角雷达（屏幕坐标，中心 cx,cy）。 */
  private drawRadarMinimapAt(
    snapshot: BattleSnapshot,
    awacs: FighterState,
    range: number,
    cx: number,
    cy: number,
    r: number,
  ): void {
    const scale = r / range

    this.activeCtx.save()
    this.activeCtx.beginPath()
    this.activeCtx.arc(cx, cy, r, 0, Math.PI * 2)
    this.activeCtx.clip()

    this.activeCtx.fillStyle = 'rgba(2, 15, 30, 0.82)'
    this.activeCtx.fillRect(cx - r, cy - r, r * 2, r * 2)

    this.activeCtx.strokeStyle = 'rgba(0, 200, 180, 0.18)'
    this.activeCtx.lineWidth = 0.8
    for (const fraction of [0.33, 0.66, 1]) {
      this.activeCtx.beginPath()
      this.activeCtx.arc(cx, cy, r * fraction, 0, Math.PI * 2)
      this.activeCtx.stroke()
    }

    const sweepTick = snapshot.tick - (snapshot.tick % MINIMAP_SWEEP_TICK_STEP)
    const sweepAngle = (sweepTick * 0.025) % (Math.PI * 2)
    this.activeCtx.strokeStyle = 'rgba(0, 255, 200, 0.22)'
    this.activeCtx.lineWidth = 1
    this.activeCtx.beginPath()
    this.activeCtx.moveTo(cx, cy)
    this.activeCtx.lineTo(cx + Math.cos(sweepAngle) * r, cy + Math.sin(sweepAngle) * r)
    this.activeCtx.stroke()

    for (const mark of snapshot.radarMarks) {
      const ex = cx + (mark.position.x - awacs.position.x) * scale
      const ey = cy + (mark.position.y - awacs.position.y) * scale
      this.activeCtx.fillStyle = '#ff4040'
      this.activeCtx.beginPath()
      this.activeCtx.arc(ex, ey, 3, 0, Math.PI * 2)
      this.activeCtx.fill()
    }

    for (const fighter of snapshot.fighters) {
      if (!fighter.alive || fighter.team !== awacs.team) {
        continue
      }
      const fx = cx + (fighter.position.x - awacs.position.x) * scale
      const fy = cy + (fighter.position.y - awacs.position.y) * scale
      const isAwacs = fighter.model === 'KJ-500'
      this.activeCtx.fillStyle = isAwacs ? '#40d8ff' : '#70ffaa'
      this.activeCtx.beginPath()
      this.activeCtx.arc(fx, fy, isAwacs ? 3 : 4, 0, Math.PI * 2)
      this.activeCtx.fill()
    }

    this.activeCtx.fillStyle = '#40d8ff'
    this.activeCtx.beginPath()
    this.activeCtx.arc(cx, cy, 3, 0, Math.PI * 2)
    this.activeCtx.fill()

    this.activeCtx.restore()

    this.activeCtx.save()
    this.activeCtx.strokeStyle = 'rgba(0, 210, 180, 0.55)'
    this.activeCtx.lineWidth = 1.5
    this.activeCtx.beginPath()
    this.activeCtx.arc(cx, cy, r, 0, Math.PI * 2)
    this.activeCtx.stroke()

    this.activeCtx.fillStyle = 'rgba(0, 200, 180, 0.7)'
    this.activeCtx.font = '10px "Consolas", sans-serif'
    this.activeCtx.textAlign = 'center'
    this.activeCtx.fillText('RADAR', cx, cy + r + 12)
    this.activeCtx.restore()
  }

  private drawRadarOfflineAt(cx: number, cy: number, r: number): void {
    this.activeCtx.save()
    this.activeCtx.beginPath()
    this.activeCtx.arc(cx, cy, r, 0, Math.PI * 2)
    this.activeCtx.fillStyle = 'rgba(2, 10, 22, 0.78)'
    this.activeCtx.fill()
    this.activeCtx.strokeStyle = 'rgba(180, 60, 60, 0.55)'
    this.activeCtx.lineWidth = 1.5
    this.activeCtx.stroke()

    this.activeCtx.fillStyle = 'rgba(220, 80, 80, 0.7)'
    this.activeCtx.font = '11px "Consolas", sans-serif'
    this.activeCtx.textAlign = 'center'
    this.activeCtx.fillText('RADAR OFF', cx, cy + 4)
    this.activeCtx.restore()
  }
}
