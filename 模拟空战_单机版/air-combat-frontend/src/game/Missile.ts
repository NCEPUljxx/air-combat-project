import type { BattlefieldContext, FighterState, MissileState, Team, Vector2 } from './types'
import type { IMissile } from './interfaces'
import type { Poolable } from './objectPool'

const TAU = Math.PI * 2

const normalizeAngle = (angle: number): number => {
  if (angle < 0) {
    return (angle % TAU) + TAU
  }
  return angle % TAU
}

const nextMissileId = (() => {
  let id = 0
  return (): string => {
    id += 1
    return `MISSILE-${id}`
  }
})()

const OUT_OF_RANGE_TRACKING_MS = 1000

export class Missile implements IMissile, Poolable {
  private state: MissileState = {
    id: nextMissileId(),
    team: 'RED',
    position: { x: 0, y: 0 },
    heading: 0,
    speed: 320,
    alive: false,
    ttlMs: 0,
    damage: 40,
  }

  private maxTurnRate = Math.PI * 2.8
  private outOfRangeTrackingMs = 0

  launch(origin: Vector2, heading: number, targetId?: string): void {
    this.state.id = nextMissileId()
    this.state.position = { ...origin }
    this.state.heading = normalizeAngle(heading)
    this.state.targetId = targetId
    this.state.alive = true
    this.state.ttlMs = 5000
    this.outOfRangeTrackingMs = OUT_OF_RANGE_TRACKING_MS
  }

  assignTeam(team: Team): void {
    this.state.team = team
  }

  setSpeed(speed: number): void {
    this.state.speed = Math.max(80, speed)
  }

  setDamage(damage: number): void {
    this.state.damage = damage
  }

  track(target: FighterState | null, deltaSeconds: number): void {
    if (!this.state.alive || !target || !target.alive) {
      return
    }

    const targetHeading = Math.atan2(
      target.position.y - this.state.position.y,
      target.position.x - this.state.position.x,
    )

    const diff = Math.atan2(
      Math.sin(targetHeading - this.state.heading),
      Math.cos(targetHeading - this.state.heading),
    )
    const maxTurn = this.maxTurnRate * deltaSeconds
    this.state.heading = normalizeAngle(this.state.heading + Math.max(-maxTurn, Math.min(maxTurn, diff)))
  }

  detonate(): void {
    this.state.alive = false
    this.state.ttlMs = 0
  }

  update(deltaSeconds: number, battlefield: BattlefieldContext): void {
    if (!this.state.alive) {
      return
    }

    this.state.ttlMs -= deltaSeconds * 1000
    if (this.state.ttlMs <= 0) {
      this.detonate()
      return
    }

    const target = this.resolveTarget(battlefield)
    if (target) {
      const isTargetInRadarCoverage = battlefield.radarMarks.some(
        (mark) => mark.targetId === this.state.targetId,
      )

      if (isTargetInRadarCoverage) {
        // Target detected by AWACS: track indefinitely, reset out-of-range timer
        this.track(target, deltaSeconds)
        this.outOfRangeTrackingMs = OUT_OF_RANGE_TRACKING_MS
      } else if (this.outOfRangeTrackingMs > 0) {
        // Target outside AWACS coverage: track for up to 1 second only
        this.track(target, deltaSeconds)
        this.outOfRangeTrackingMs = Math.max(0, this.outOfRangeTrackingMs - deltaSeconds * 1000)
      }
      // else: fly straight, no tracking
    }

    this.state.position.x += Math.cos(this.state.heading) * this.state.speed * deltaSeconds
    this.state.position.y += Math.sin(this.state.heading) * this.state.speed * deltaSeconds

    if (
      this.state.position.x < 0 ||
      this.state.position.x > battlefield.worldWidth ||
      this.state.position.y < 0 ||
      this.state.position.y > battlefield.worldHeight
    ) {
      this.detonate()
    }
  }

  getState(): MissileState {
    return {
      ...this.state,
      position: { ...this.state.position },
    }
  }

  reset(): void {
    this.state.alive = false
    this.state.ttlMs = 0
    this.state.targetId = undefined
    this.outOfRangeTrackingMs = 0
  }

  private resolveTarget(battlefield: BattlefieldContext): FighterState | null {
    if (!this.state.targetId) {
      return null
    }
    return battlefield.fighters.find((fighter) => fighter.id === this.state.targetId && fighter.alive) ?? null
  }
}
