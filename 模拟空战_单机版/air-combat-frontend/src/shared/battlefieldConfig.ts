export type FighterType = 'J-20' | 'J-16' | 'J-10C' | 'J-25'

export interface FighterTypeConfig {
  label: string
  model: string
  maxSpeed: number
  minSpeed: number
  hp: number
  turnRate: number
  acceleration: number
  fireCooldownMs: number
  missileDamage: number
  bombDamage: number
  bombRadius: number
  missileCount: number
  bombCount: number
}

export const FIGHTER_TYPES: Record<FighterType, FighterTypeConfig> = {
  'J-20': {
    label: '歼-20 威龙',
    model: 'J-20',
    maxSpeed: 230, minSpeed: 80, hp: 150,
    turnRate: Math.PI * 1.4, acceleration: 140,
    fireCooldownMs: 200,
    missileDamage: 40, bombDamage: 80, bombRadius: 110,
    missileCount: 32,
    bombCount: 7,
  },
  'J-16': {
    label: '歼-16 猛龙',
    model: 'J-16',
    maxSpeed: 180, minSpeed: 70, hp: 220,
    turnRate: Math.PI * 0.9, acceleration: 100,
    fireCooldownMs: 280,
    missileDamage: 55, bombDamage: 120, bombRadius: 140,
    missileCount: 48,
    bombCount: 12,
  },
  'J-10C': {
    label: '歼-10C 火鸟',
    model: 'J-10C',
    maxSpeed: 200, minSpeed: 75, hp: 170,
    turnRate: Math.PI * 1.6, acceleration: 120,
    fireCooldownMs: 220,
    missileDamage: 45, bombDamage: 90, bombRadius: 120,
    missileCount: 40,
    bombCount: 9,
  },
  'J-25': {
    label: '歼-25 迅箭',
    model: 'J-25',
    maxSpeed: 260, minSpeed: 90, hp: 130,
    turnRate: Math.PI * 1.8, acceleration: 160,
    fireCooldownMs: 180,
    missileDamage: 50, bombDamage: 100, bombRadius: 130,
    missileCount: 24,
    bombCount: 5,
  },
}

export const FIGHTER_TYPE_LIST: FighterType[] = ['J-20', 'J-16', 'J-10C', 'J-25']

export const worldSize = {
  width: 3600,
  height: 2160,
} as const

export const viewportSize = {
  width: 1200,
  height: 720,
} as const

export const playerRadarRange = 300
export const awacsRadarRangeMax = 900
