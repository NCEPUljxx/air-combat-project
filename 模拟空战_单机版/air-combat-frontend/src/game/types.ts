export type Team = 'RED' | 'BLUE'
export type ControlType = 'PLAYER' | 'AI'
export type BattleStatus = 'WAITING' | 'RUNNING' | 'RED_WIN' | 'BLUE_WIN' | 'DRAW' | 'FAILED'
export type AIDifficulty = 'EASY' | 'NORMAL' | 'HARD'
export type GameDifficulty = AIDifficulty
export type FighterType = 'J-20' | 'J-16' | 'J-10C' | 'J-25'

export type MessageType =
  | 'MSG_FIGHTER_MOVE'
  | 'MSG_MISSILE_LAUNCH'
  | 'MSG_HIT_RESULT'
  | 'MSG_BATTLE_STATUS'
  | 'MSG_PLAYER_INPUT'
  | 'MSG_ROOM_EVENT'
  | 'MSG_ERROR'

export interface Vector2 {
  x: number
  y: number
}

export interface Viewport {
  x: number
  y: number
  width: number
  height: number
}

export interface FighterState {
  id: string
  team: Team
  model: string
  position: Vector2
  heading: number
  speed: number
  hp: number
  maxHp: number
  missileCount: number
  bombCount: number
  infiniteMissiles?: boolean
  alive: boolean
  controlType: ControlType
  nickname?: string
}

export interface MissileState {
  id: string
  team: Team
  position: Vector2
  heading: number
  speed: number
  targetId?: string
  alive: boolean
  ttlMs: number
  damage: number
}

export interface BombState {
  id: string
  team: Team
  position: Vector2
  heading: number
  speed: number
  alive: boolean
  ttlMs: number
  blastRadius: number
  blastDamage: number
}

export interface RadarMark {
  targetId: string
  position: Vector2
  team: Team
  distance: number
  detected: boolean
}

export interface HitResult {
  missileId: string
  fighterId: string
  damage: number
  destroyed: boolean
}

export interface DamagePopup {
  id: string
  position: Vector2
  damage: number
  ttlMs: number
  team: Team
}

export interface BattleSnapshot {
  roomId?: string
  tick: number
  status: BattleStatus
  fighters: FighterState[]
  missiles: MissileState[]
  bombs: BombState[]
  radarMarks: RadarMark[]
  damagePopups: DamagePopup[]
  redAlive: number
  blueAlive: number
  viewport: Viewport
  awacsRadarRange: number
  battleElapsedMs: number
}

export interface InputCommand {
  moveX: -1 | 0 | 1
  moveY: -1 | 0 | 1
  fire: boolean
  fireBomb: boolean
  fireHeading?: number
  fireBombHeading?: number
  /** When true and fire is set, aim from mouse canvas position + viewport; else use player heading. */
  missileFireFromMouse?: boolean
  bombFireFromMouse?: boolean
}

export interface AICommand {
  turn: -1 | 0 | 1
  throttle: number
  fire: boolean
  fireBomb?: boolean
  targetId?: string
}

export interface BattlefieldContext {
  tick: number
  fighters: FighterState[]
  missiles: MissileState[]
  bombs: BombState[]
  radarMarks: RadarMark[]
  status: BattleStatus
  worldWidth: number
  worldHeight: number
}

export interface NetworkMessage<T = unknown> {
  type: MessageType
  roomId?: number
  userId?: number
  tick?: number
  timestamp?: number
  payload: T
}
