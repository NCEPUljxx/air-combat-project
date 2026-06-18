import type { IAIController, IFighter } from './interfaces'
import type { AICommand, AIDifficulty, BattlefieldContext, FighterState } from './types'

const wrapAngleDiff = (target: number, current: number): number =>
  Math.atan2(Math.sin(target - current), Math.cos(target - current))

export class SimpleAIController implements IAIController {
  private fireChance = 0.015

  decide(self: FighterState, battlefield: BattlefieldContext): AICommand {
    const enemies = battlefield.fighters.filter(
      (fighter) => fighter.alive && fighter.team !== self.team,
    )

    if (enemies.length === 0) {
      return {
        turn: 0,
        throttle: 0.3,
        fire: false,
      }
    }

    let nearest = enemies[0]
    let nearestDistance = Number.MAX_SAFE_INTEGER
    for (const enemy of enemies) {
      const distance = Math.hypot(enemy.position.x - self.position.x, enemy.position.y - self.position.y)
      if (distance < nearestDistance) {
        nearestDistance = distance
        nearest = enemy
      }
    }

    const headingToEnemy = Math.atan2(
      nearest.position.y - self.position.y,
      nearest.position.x - self.position.x,
    )
    const headingDiff = wrapAngleDiff(headingToEnemy, self.heading)

    const canFire = nearestDistance < 260 && Math.abs(headingDiff) < 0.35 && Math.random() < this.fireChance
    const canBomb = !canFire && nearestDistance < 200 && self.bombCount > 0 && Math.random() < this.fireChance * 1.5
    return {
      turn: headingDiff > 0.08 ? 1 : headingDiff < -0.08 ? -1 : 0,
      throttle: nearestDistance > 220 ? 0.6 : 0.15,
      fire: canFire,
      fireBomb: canBomb,
      targetId: nearest.id,
    }
  }

  execute(_command: AICommand, _fighter: IFighter): void {
    // AI command execution is handled by Battlefield to keep model coordination in one place.
  }

  setDifficulty(level: AIDifficulty): void {
    if (level === 'EASY') {
      this.fireChance = 0.006
      return
    }
    if (level === 'HARD') {
      this.fireChance = 0.03
      return
    }

    this.fireChance = 0.015
  }
}
