import type { BattleSnapshot, InputCommand } from '../game/types'

/** World-space fire direction: mouse → point under cursor; keyboard → player heading. */
export function augmentInputWithWorldFireAngles(
  raw: InputCommand,
  snap: BattleSnapshot,
  playerId: string,
  mouseCanvasX: number,
  mouseCanvasY: number,
): InputCommand {
  const player = snap.fighters.find((f) => f.id === playerId)
  const out: InputCommand = { ...raw }
  if (raw.fire && player) {
    out.fireHeading = raw.missileFireFromMouse
      ? Math.atan2(
          snap.viewport.y + mouseCanvasY - player.position.y,
          snap.viewport.x + mouseCanvasX - player.position.x,
        )
      : player.heading
  }
  if (raw.fireBomb && player) {
    out.fireBombHeading = raw.bombFireFromMouse
      ? Math.atan2(
          snap.viewport.y + mouseCanvasY - player.position.y,
          snap.viewport.x + mouseCanvasX - player.position.x,
        )
      : player.heading
  }
  return out
}
