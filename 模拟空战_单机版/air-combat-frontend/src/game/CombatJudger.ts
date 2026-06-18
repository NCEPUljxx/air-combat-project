import type { ICombatJudger } from './interfaces'
import type { BattlefieldContext, BattleStatus, HitResult, FighterState, MissileState } from './types'

export class CombatJudger implements ICombatJudger {
  private readonly hitRadius = 14
  private readonly gridSize = 96

  checkCollision(missile: MissileState, fighter: FighterState): boolean {
    const distance = Math.hypot(
      missile.position.x - fighter.position.x,
      missile.position.y - fighter.position.y,
    )
    return distance <= this.hitRadius
  }

  judgeHit(battlefield: BattlefieldContext): HitResult[] {
    const hits: HitResult[] = []
    const fighterGrid = this.buildFighterGrid(battlefield.fighters)

    for (const missile of battlefield.missiles) {
      if (!missile.alive) {
        continue
      }
      const candidates = this.getNearbyFighters(fighterGrid, missile)
      for (const fighter of candidates) {
        if (!fighter.alive || fighter.team === missile.team) {
          continue
        }
        if (!this.checkCollision(missile, fighter)) {
          continue
        }
        hits.push({
          missileId: missile.id,
          fighterId: fighter.id,
          damage: missile.damage,
          destroyed: fighter.hp <= missile.damage,
        })
        break
      }
    }

    return hits
  }

  private buildFighterGrid(fighters: FighterState[]): Map<string, FighterState[]> {
    const grid = new Map<string, FighterState[]>()
    for (const fighter of fighters) {
      if (!fighter.alive) {
        continue
      }
      const key = this.toCellKey(fighter.position.x, fighter.position.y)
      const bucket = grid.get(key)
      if (bucket) {
        bucket.push(fighter)
      } else {
        grid.set(key, [fighter])
      }
    }
    return grid
  }

  private getNearbyFighters(grid: Map<string, FighterState[]>, missile: MissileState): FighterState[] {
    const x = Math.floor(missile.position.x / this.gridSize)
    const y = Math.floor(missile.position.y / this.gridSize)
    const nearby: FighterState[] = []
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        const key = `${x + dx}:${y + dy}`
        const bucket = grid.get(key)
        if (!bucket) {
          continue
        }
        nearby.push(...bucket)
      }
    }
    return nearby
  }

  private toCellKey(x: number, y: number): string {
    return `${Math.floor(x / this.gridSize)}:${Math.floor(y / this.gridSize)}`
  }

  updateBattleStatus(battlefield: BattlefieldContext): BattleStatus {
    if (battlefield.status !== 'RUNNING') {
      return battlefield.status
    }

    const redAlive = battlefield.fighters.some((fighter) => fighter.team === 'RED' && fighter.alive && fighter.model !== 'KJ-500')
    const blueAlive = battlefield.fighters.some((fighter) => fighter.team === 'BLUE' && fighter.alive && fighter.model !== 'KJ-500')

    if (!redAlive && !blueAlive) {
      return 'FAILED'
    }
    if (!blueAlive) {
      return 'RED_WIN'
    }
    if (!redAlive) {
      return 'BLUE_WIN'
    }

    return 'RUNNING'
  }
}
