import { Battlefield } from '../game/Battlefield'
import type { AIDifficulty, BattleSnapshot, FighterType } from '../game/types'
import { augmentInputWithWorldFireAngles } from './augmentInputFireHeading'
import { InputController } from './InputController'

interface FrameState {
  snapshot: BattleSnapshot
  fps: number
}

type FrameListener = (state: FrameState) => void

const createInitialSnapshot = (): BattleSnapshot => ({
  tick: 0,
  status: 'RUNNING',
  fighters: [],
  missiles: [],
  bombs: [],
  radarMarks: [],
  damagePopups: [],
  redAlive: 0,
  blueAlive: 0,
  viewport: { x: 0, y: 0, width: 1200, height: 720 },
  awacsRadarRange: 900,
  battleElapsedMs: 0,
})

export class LocalGameController {
  private readonly battlefield: Battlefield
  private readonly inputController = new InputController()
  private listeners: FrameListener[] = []
  private rafId = 0
  private running = false
  private lastFrameMs = 0
  private snapshot: BattleSnapshot = createInitialSnapshot()

  constructor(difficulty: AIDifficulty = 'NORMAL', fighterType: FighterType = 'J-20') {
    this.battlefield = new Battlefield(difficulty, fighterType)
  }

  start(): void {
    if (this.running) {
      return
    }
    this.running = true
    this.battlefield.reset()
    this.snapshot = this.battlefield.getSnapshot()
    this.lastFrameMs = 0
    this.loop(0)
  }

  stop(): void {
    this.running = false
    if (this.rafId) {
      window.cancelAnimationFrame(this.rafId)
      this.rafId = 0
    }
    this.inputController.detach()
  }

  restart(): void {
    if (this.rafId) {
      window.cancelAnimationFrame(this.rafId)
      this.rafId = 0
    }
    this.running = false
    this.battlefield.reset()
    this.snapshot = this.battlefield.getSnapshot()
    this.lastFrameMs = 0
    this.notify()
    this.running = true
    this.loop(0)
  }

  bindCanvas(canvas: HTMLCanvasElement): void {
    this.inputController.attach(canvas)
  }

  onFrame(listener: FrameListener): () => void {
    this.listeners.push(listener)
    listener({ snapshot: this.snapshot, fps: 0 })
    return () => {
      this.listeners = this.listeners.filter((item) => item !== listener)
    }
  }

  getSnapshot(): BattleSnapshot {
    return this.snapshot
  }

  getPlayerId(): string {
    return this.battlefield.getPlayerId()
  }

  private loop = (timestampMs: number): void => {
    if (!this.running) {
      return
    }

    if (this.lastFrameMs === 0) {
      this.lastFrameMs = timestampMs
    }

    const deltaSeconds = Math.min(0.05, Math.max(0.001, (timestampMs - this.lastFrameMs) / 1000))
    this.lastFrameMs = timestampMs

    const raw = this.inputController.consume()
    const mc = this.inputController.getMouseCanvasLocal()
    const command = augmentInputWithWorldFireAngles(
      raw,
      this.snapshot,
      this.battlefield.getPlayerId(),
      mc.x,
      mc.y,
    )
    this.battlefield.update(deltaSeconds, command)
    this.snapshot = this.battlefield.getSnapshot()
    this.notify()

    if (this.snapshot.status === 'RUNNING') {
      this.rafId = window.requestAnimationFrame(this.loop)
    } else {
      this.running = false
    }
  }

  private notify(): void {
    const frameState: FrameState = { snapshot: this.snapshot, fps: 0 }
    for (const listener of this.listeners) {
      listener(frameState)
    }
  }
}
