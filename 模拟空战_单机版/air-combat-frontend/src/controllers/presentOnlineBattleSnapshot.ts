import type { BattleSnapshot, FighterState } from '../game/types'
import { awacsRadarRangeMax, viewportSize, worldSize } from '../shared/battlefieldConfig'

const AWACS_MAX_HP = 260

/** 就地写 viewport / awacsRadarRange，避免 `{ ...raw }` 额外分配（对象仍为 normalize 新建的引用）。 */
export function presentOnlineBattleSnapshot(raw: BattleSnapshot, playerFighterId: string): BattleSnapshot {
  const vw = viewportSize.width
  const vh = viewportSize.height
  const fighters = raw.fighters
  let pf: FighterState | undefined
  if (playerFighterId) {
    for (let i = 0; i < fighters.length; i++) {
      if (fighters[i].id === playerFighterId) {
        pf = fighters[i]
        break
      }
    }
  }
  if (pf) {
    raw.viewport.x = Math.max(0, Math.min(worldSize.width - vw, pf.position.x - vw / 2))
    raw.viewport.y = Math.max(0, Math.min(worldSize.height - vh, pf.position.y - vh / 2))
    raw.viewport.width = vw
    raw.viewport.height = vh
  }
  const playerTeam = pf?.team ?? 'RED'
  let awacs: FighterState | undefined
  for (let i = 0; i < fighters.length; i++) {
    const f = fighters[i]
    if (f.model === 'KJ-500' && f.team === playerTeam) {
      awacs = f
      break
    }
  }
  raw.awacsRadarRange =
    awacs && awacs.alive ? awacsRadarRangeMax * (awacs.hp / AWACS_MAX_HP) : 0
  return raw
}
