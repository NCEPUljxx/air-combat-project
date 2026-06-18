import type { BattlefieldContext, ControlType, FighterState, Team, Vector2 } from './types'
import type { IFighter, IMissile } from './interfaces'

const TAU = Math.PI * 2

const normalizeAngle = (angle: number): number => {
  if (angle < 0) {
    return (angle % TAU) + TAU
  }
  return angle % TAU
}

export interface FighterConfig {
  id: string
  team: Team
  controlType: ControlType
  model: string
  position: Vector2
  heading: number
  speed: number
  hp: number
  maxHp?: number
  missileCount: number
  bombCount: number
  infiniteMissiles?: boolean
  maxSpeed: number
  minSpeed: number
  turnRate: number
  acceleration: number
  fireCooldownMs: number
}

export class Fighter implements IFighter {
  private readonly state: FighterState
  private readonly maxSpeed: number
  private readonly minSpeed: number
  private readonly turnRate: number
  private readonly acceleration: number
  private readonly fireCooldownMs: number
  private cooldownMs = 0

  constructor(config: FighterConfig) {
    this.maxSpeed = config.maxSpeed
    this.minSpeed = config.minSpeed
    this.turnRate = config.turnRate
    this.acceleration = config.acceleration
    this.fireCooldownMs = config.fireCooldownMs
    this.state = {
      id: config.id,
      team: config.team,
      model: config.model,
      position: { ...config.position },
      heading: normalizeAngle(config.heading),
      speed: config.speed,
      hp: config.hp,
      maxHp: config.maxHp ?? config.hp,
      missileCount: config.missileCount,
      bombCount: config.bombCount,
      infiniteMissiles: config.infiniteMissiles,
      alive: true,
      controlType: config.controlType,
    }
  }

  move(deltaSeconds: number): void {
    if (!this.state.alive) {
      return
    }
    this.state.position.x += Math.cos(this.state.heading) * this.state.speed * deltaSeconds
    this.state.position.y += Math.sin(this.state.heading) * this.state.speed * deltaSeconds
  }

  fire(_targetId?: string): IMissile | null {
    if (!this.canFire()) {
      return null
    }
    if (!this.state.infiniteMissiles) {
      this.state.missileCount -= 1
    }
    this.cooldownMs = this.fireCooldownMs
    return null
  }

  canFire(): boolean {
    return (
      this.state.alive &&
      this.cooldownMs <= 0 &&
      (this.state.infiniteMissiles === true || this.state.missileCount > 0)
    )
  }

  consumeMissile(): boolean {
    if (!this.canFire()) {
      return false
    }
    if (!this.state.infiniteMissiles) {
      this.state.missileCount -= 1
    }
    this.cooldownMs = this.fireCooldownMs
    return true
  }

  consumeBomb(): boolean {
    if (!this.state.alive || this.state.bombCount <= 0) {
      return false
    }
    this.state.bombCount -= 1
    return true
  }

  turn(direction: -1 | 0 | 1, deltaSeconds: number): void {
    if (!this.state.alive || direction === 0) {
      return
    }
    this.state.heading = normalizeAngle(this.state.heading + direction * this.turnRate * deltaSeconds)
  }

  steerTo(heading: number, deltaSeconds: number): void {
    if (!this.state.alive) {
      return
    }
    const desired = normalizeAngle(heading)
    const current = this.state.heading
    const diff = Math.atan2(Math.sin(desired - current), Math.cos(desired - current))
    const maxTurn = this.turnRate * deltaSeconds
    this.state.heading = normalizeAngle(current + Math.max(-maxTurn, Math.min(maxTurn, diff)))
  }

  setHeading(heading: number): void {
    if (!this.state.alive) {
      return
    }
    this.state.heading = normalizeAngle(heading)
  }

  setSpeed(speed: number): void {
    if (!this.state.alive) {
      return
    }
    this.state.speed = Math.max(0, Math.min(this.maxSpeed, speed))
  }

  throttle(intensity: number, deltaSeconds: number): void {
    if (!this.state.alive || intensity === 0) {
      return
    }
    const nextSpeed = this.state.speed + intensity * this.acceleration * deltaSeconds
    this.state.speed = Math.max(this.minSpeed, Math.min(this.maxSpeed, nextSpeed))
  }

  takeDamage(amount: number): void {
    if (!this.state.alive) {
      return
    }
    this.state.hp = Math.max(0, this.state.hp - amount)
    if (this.state.hp <= 0) {
      this.state.alive = false
    }
  }

  update(deltaSeconds: number, _battlefield: BattlefieldContext): void {
    if (!this.state.alive) {
      return
    }
    this.cooldownMs = Math.max(0, this.cooldownMs - deltaSeconds * 1000)
  }

  keepInBounds(width: number, height: number): void {
    if (!this.state.alive) {
      return
    }
    this.state.position.x = Math.max(0, Math.min(width, this.state.position.x))
    this.state.position.y = Math.max(0, Math.min(height, this.state.position.y))
  }

  getState(): FighterState {
    return {
      ...this.state,
      position: { ...this.state.position },
    }
  }
}
