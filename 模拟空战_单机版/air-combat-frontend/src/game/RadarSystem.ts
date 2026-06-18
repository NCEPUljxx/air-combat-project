import type { IRadarSystem } from './interfaces'
import type { FighterState, RadarMark } from './types'

export class RadarSystem implements IRadarSystem {
  private range = 220
  private detectedTargets: RadarMark[] = []

  constructor(initialRange = 220) {
    this.range = initialRange
  }

  scan(observer: FighterState, targets: FighterState[]): RadarMark[] {
    this.detectedTargets = targets
      .filter((target) => target.alive && target.team !== observer.team)
      .map((target) => {
        const dx = target.position.x - observer.position.x
        const dy = target.position.y - observer.position.y
        const distance = Math.hypot(dx, dy)
        return {
          targetId: target.id,
          position: { ...target.position },
          team: target.team,
          distance,
          detected: distance <= this.range,
        }
      })
      .filter((mark) => mark.detected)

    return this.getDetectedTargets()
  }

  getDetectedTargets(): RadarMark[] {
    return this.detectedTargets.map((mark) => ({
      ...mark,
      position: { ...mark.position },
    }))
  }

  setRange(range: number): void {
    this.range = range
  }
}
