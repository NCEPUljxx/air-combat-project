import type { BattleSnapshot } from '../game/types'

/** 大厅/连接初期与 OnlineGameController 共用的空白快照初始值 */
export function createInitialBattleSnapshot(): BattleSnapshot {
  return {
    roomId: undefined,
    tick: 0,
    status: 'WAITING',
    fighters: [],
    missiles: [],
    bombs: [],
    radarMarks: [],
    damagePopups: [],
    redAlive: 0,
    blueAlive: 0,
    viewport: { x: 0, y: 0, width: 1200, height: 720 },
    awacsRadarRange: 0,
    battleElapsedMs: 0,
  }
}
