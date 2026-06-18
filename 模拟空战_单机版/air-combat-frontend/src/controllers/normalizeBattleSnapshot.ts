import type {
  BattleSnapshot,
  BombState,
  DamagePopup,
  FighterState,
  MissileState,
  RadarMark,
  Team,
  Vector2,
} from '../game/types'

function coerceTeam(raw: unknown): Team {
  const s = typeof raw === 'string' ? raw.toUpperCase() : ''
  return s === 'BLUE' ? 'BLUE' : 'RED'
}

function coerceVector2(pos: unknown, fallback?: { x?: number; y?: number }): Vector2 {
  if (pos && typeof pos === 'object' && 'x' in pos && 'y' in pos) {
    const o = pos as Record<string, unknown>
    return { x: Number(o.x) || 0, y: Number(o.y) || 0 }
  }
  return { x: Number(fallback?.x) || 0, y: Number(fallback?.y) || 0 }
}

function normalizeFighter(raw: Record<string, unknown>, index: number): FighterState {
  return {
    id: String(raw.id ?? `f-${index}`),
    team: coerceTeam(raw.team),
    model: String(raw.model ?? 'J-20'),
    position: coerceVector2(raw.position, { x: Number(raw.x), y: Number(raw.y) }),
    heading: Number(raw.heading ?? 0),
    speed: Number(raw.speed ?? 0),
    hp: Number(raw.hp ?? 0),
    maxHp: Number(raw.maxHp ?? 100),
    missileCount: Number(raw.missileCount ?? 0),
    bombCount: Number(raw.bombCount ?? 0),
    infiniteMissiles: raw.infiniteMissiles === true,
    alive: Boolean(raw.alive !== false),
    controlType: raw.controlType === 'AI' ? 'AI' : 'PLAYER',
    nickname: raw.nickname ? String(raw.nickname) : undefined,
  }
}

function normalizeMissile(raw: Record<string, unknown>, index: number): MissileState {
  return {
    id: String(raw.id ?? `m-${index}`),
    team: coerceTeam(raw.team),
    position: coerceVector2(raw.position),
    heading: Number(raw.heading ?? 0),
    speed: Number(raw.speed ?? 14),
    targetId: raw.targetId != null ? String(raw.targetId) : undefined,
    alive: raw.alive !== false,
    ttlMs: Number(raw.ttlMs ?? 0),
    damage: Number(raw.damage ?? 40),
  }
}

function normalizeBomb(raw: Record<string, unknown>, index: number): BombState {
  return {
    id: String(raw.id ?? `b-${index}`),
    team: coerceTeam(raw.team),
    position: coerceVector2(raw.position),
    heading: Number(raw.heading ?? 0),
    speed: Number(raw.speed ?? 7),
    alive: raw.alive !== false,
    ttlMs: Number(raw.ttlMs ?? 3000),
    blastRadius: Number(raw.blastRadius ?? 110),
    blastDamage: Number(raw.blastDamage ?? 80),
  }
}

function normalizeRadarMark(raw: Record<string, unknown>, index: number): RadarMark {
  return {
    targetId: String(raw.targetId ?? `t-${index}`),
    position: coerceVector2(raw.position),
    team: coerceTeam(raw.team),
    distance: Number(raw.distance ?? 0),
    detected: raw.detected !== false,
  }
}

/** 后端 DamagePopup 序列化为平铺 x/y；转为前端结构，避免渲染报错 */
function normalizeDamagePopups(raw: unknown): DamagePopup[] {
  if (!Array.isArray(raw)) {
    return []
  }
  return raw.map((item, index) => {
    const o = item as Record<string, unknown>
    if (o.position && typeof o.position === 'object') {
      return {
        id: String(o.id ?? `pop-${index}`),
        position: coerceVector2(o.position),
        damage: Number(o.damage ?? 0),
        ttlMs: Number(o.ttlMs ?? 760),
        team: coerceTeam(o.team),
      }
    }
    return {
      id: String(o.id ?? `pop-${index}`),
      position: { x: Number(o.x) || 0, y: Number(o.y) || 0 },
      damage: Number(o.damage ?? 0),
      ttlMs: Number(o.ttlMs ?? 760),
      team: coerceTeam(o.team),
    }
  })
}

const defaultViewport = { x: 0, y: 0, width: 1200, height: 720 }

export function normalizeBattleSnapshot(payload: Record<string, unknown>): BattleSnapshot {
  const fightersIn = payload.fighters
  const fighters = Array.isArray(fightersIn)
    ? fightersIn.map((f, i) => normalizeFighter(f as Record<string, unknown>, i))
    : []
  const missilesIn = payload.missiles
  const missiles = Array.isArray(missilesIn)
    ? missilesIn.map((m, i) => normalizeMissile(m as Record<string, unknown>, i))
    : []
  const bombsIn = payload.bombs
  const bombs = Array.isArray(bombsIn)
    ? bombsIn.map((b, i) => normalizeBomb(b as Record<string, unknown>, i))
    : []
  const radarIn = payload.radarMarks
  const radarMarks = Array.isArray(radarIn)
    ? radarIn.map((r, i) => normalizeRadarMark(r as Record<string, unknown>, i))
    : []

  const vpRaw = payload.viewport as Record<string, unknown> | undefined
  const viewport =
    vpRaw && typeof vpRaw === 'object'
      ? {
          x: Number(vpRaw.x) || 0,
          y: Number(vpRaw.y) || 0,
          width: Number(vpRaw.width) || defaultViewport.width,
          height: Number(vpRaw.height) || defaultViewport.height,
        }
      : defaultViewport

  const statusRaw = payload.status
  const status =
    statusRaw === 'RUNNING' ||
    statusRaw === 'WAITING' ||
    statusRaw === 'RED_WIN' ||
    statusRaw === 'BLUE_WIN' ||
    statusRaw === 'DRAW' ||
    statusRaw === 'FAILED'
      ? statusRaw
      : 'WAITING'

  return {
    roomId: payload.roomId != null ? String(payload.roomId) : undefined,
    tick: Number(payload.tick ?? 0),
    status,
    fighters,
    missiles,
    bombs,
    radarMarks,
    damagePopups: normalizeDamagePopups(payload.damagePopups),
    redAlive: Number(payload.redAlive ?? 0),
    blueAlive: Number(payload.blueAlive ?? 0),
    viewport,
    awacsRadarRange: Number(payload.awacsRadarRange ?? 0),
    battleElapsedMs: Number(payload.battleElapsedMs ?? payload.battle_elapsed_ms ?? 0),
  }
}
