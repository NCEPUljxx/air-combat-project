import type { BattlefieldContext, BombState, Team, Vector2 } from './types'
import type { Poolable } from './objectPool'

const nextBombId = (() => {
  let id = 0
  return (): string => {
    id += 1
    return `BOMB-${id}`
  }
})()

const BOMB_SPEED = 120
const BOMB_TTL_MS = 3000
const BOMB_HIT_RADIUS = 24

export interface BombDetonation {
  bombId: string
  position: Vector2
  blastRadius: number
  blastDamage: number
  hitFighterIds: string[]
}

export class Bomb implements Poolable {
  private state: BombState = {
    id: nextBombId(),
    team: 'RED',
    position: { x: 0, y: 0 },
    heading: 0,
    speed: BOMB_SPEED,
    alive: false,
    ttlMs: 0,
    blastRadius: 120,
    blastDamage: 80,
  }

  launch(origin: Vector2, heading: number, blastRadius: number, blastDamage: number): void {
    this.state.id = nextBombId()
    this.state.position = { ...origin }
    this.state.heading = heading
    this.state.speed = BOMB_SPEED
    this.state.alive = true
    this.state.ttlMs = BOMB_TTL_MS
    this.state.blastRadius = blastRadius
    this.state.blastDamage = blastDamage
  }

  assignTeam(team: Team): void {
    this.state.team = team
  }

  /**
   * Returns a detonation record if the bomb should explode this frame, otherwise null.
   * Detonation triggers: ttl expires OR any enemy fighter within BOMB_HIT_RADIUS.
   */
  update(deltaSeconds: number, battlefield: BattlefieldContext): BombDetonation | null {
    if (!this.state.alive) {
      return null
    }

    this.state.ttlMs -= deltaSeconds * 1000
    const timedOut = this.state.ttlMs <= 0

    this.state.position.x += Math.cos(this.state.heading) * this.state.speed * deltaSeconds
    this.state.position.y += Math.sin(this.state.heading) * this.state.speed * deltaSeconds

    const outOfBounds =
      this.state.position.x < 0 ||
      this.state.position.x > battlefield.worldWidth ||
      this.state.position.y < 0 ||
      this.state.position.y > battlefield.worldHeight

    const proximityEnemy = battlefield.fighters.find(
      (fighter) =>
        fighter.alive &&
        fighter.team !== this.state.team &&
        Math.hypot(fighter.position.x - this.state.position.x, fighter.position.y - this.state.position.y) <=
          BOMB_HIT_RADIUS,
    )

    if (timedOut || outOfBounds || proximityEnemy) {
      return this.detonate(battlefield)
    }

    return null
  }

  private detonate(battlefield: BattlefieldContext): BombDetonation {
    const pos = { ...this.state.position }
    const hitFighterIds = battlefield.fighters
      .filter(
        (fighter) =>
          fighter.alive &&
          fighter.team !== this.state.team &&
          Math.hypot(fighter.position.x - pos.x, fighter.position.y - pos.y) <= this.state.blastRadius,
      )
      .map((fighter) => fighter.id)

    this.state.alive = false
    this.state.ttlMs = 0

    return {
      bombId: this.state.id,
      position: pos,
      blastRadius: this.state.blastRadius,
      blastDamage: this.state.blastDamage,
      hitFighterIds,
    }
  }

  getState(): BombState {
    return {
      ...this.state,
      position: { ...this.state.position },
    }
  }

  reset(): void {
    this.state.alive = false
    this.state.ttlMs = 0
  }
}
