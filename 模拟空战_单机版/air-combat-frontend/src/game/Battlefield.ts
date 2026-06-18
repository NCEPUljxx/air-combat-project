import { Bomb } from './Bomb'
import { CombatJudger } from './CombatJudger'
import { Fighter, type FighterConfig } from './Fighter'
import { Missile } from './Missile'
import { RadarSystem } from './RadarSystem'
import { SimpleAIController } from './SimpleAIController'
import type {
  AIDifficulty,
  BattleSnapshot,
  BattleStatus,
  DamagePopup,
  FighterState,
  InputCommand,
  RadarMark,
  Vector2,
  Viewport,
} from './types'
import { ObjectPool } from './objectPool'
import {
  FIGHTER_TYPES,
  awacsRadarRangeMax,
  playerRadarRange,
  viewportSize,
  worldSize,
  type FighterType,
} from '../shared/battlefieldConfig'

const PLAYER_ID = 'RED-PLAYER-1'
const AWACS_ID = 'RED-AWACS-1'
const POPUP_TTL_MS = 760
const MISSILE_SPEED = 320
const AWACS_MAX_RADAR_RANGE = awacsRadarRangeMax
const FIGHTER_COLLISION_DIST = 30
const COLLISION_COOLDOWN_MS = 2000
/** 单机模式：蓝方 AI 相对配置属性削弱 30%（保留 70%） */
const SINGLE_PLAYER_AI_STAT_FACTOR = 0.7

const ENEMY_COUNT_MAP: Record<AIDifficulty, number> = {
  EASY: 4,
  NORMAL: 8,
  HARD: 12,
}

export class Battlefield {
  private fighters: Fighter[] = []
  private activeMissiles: Missile[] = []
  private activeBombs: Bomb[] = []
  private readonly missilePool = new ObjectPool(() => new Missile(), 80, 200)
  private readonly bombPool = new ObjectPool(() => new Bomb(), 20, 40)
  private readonly combatJudger = new CombatJudger()
  private readonly aiController = new SimpleAIController()
  private readonly playerRadar = new RadarSystem(playerRadarRange)
  private awacsRadar: RadarSystem
  private radarMarks: RadarMark[] = []
  private damagePopups: DamagePopup[] = []
  private tick = 0
  private popupSeq = 0
  private status: BattleStatus = 'RUNNING'
  private difficulty: AIDifficulty
  private fighterType: FighterType
  private currentAwacsRadarRange = AWACS_MAX_RADAR_RANGE
  private readonly collisionCooldowns = new Map<string, number>()
  private battleWallStartMs = 0
  /** Set once when arena leaves RUNNING; ms since reset. */
  private terminalBattleElapsedMs: number | null = null

  readonly width: number
  readonly height: number

  constructor(
    difficulty: AIDifficulty = 'NORMAL',
    fighterType: FighterType = 'J-20',
    width = worldSize.width,
    height = worldSize.height,
  ) {
    this.difficulty = difficulty
    this.fighterType = fighterType
    this.width = width
    this.height = height
    this.awacsRadar = new RadarSystem(AWACS_MAX_RADAR_RANGE)
    this.reset()
  }

  reset(): void {
    this.fighters = []
    for (const missile of this.activeMissiles) {
      this.missilePool.release(missile)
    }
    this.activeMissiles = []
    for (const bomb of this.activeBombs) {
      this.bombPool.release(bomb)
    }
    this.activeBombs = []
    this.radarMarks = []
    this.damagePopups = []
    this.tick = 0
    this.popupSeq = 0
    this.status = 'RUNNING'
    this.battleWallStartMs = performance.now()
    this.terminalBattleElapsedMs = null
    this.currentAwacsRadarRange = AWACS_MAX_RADAR_RANGE
    this.awacsRadar.setRange(AWACS_MAX_RADAR_RANGE)
    this.aiController.setDifficulty(this.difficulty)
    this.spawnFriendlyUnits()
    this.spawnBlueAiSquad()
  }

  setDifficulty(difficulty: AIDifficulty): void {
    this.difficulty = difficulty
    this.aiController.setDifficulty(difficulty)
  }

  update(deltaSeconds: number, input: InputCommand): void {
    const wasRunning = this.status === 'RUNNING'

    if (this.status !== 'RUNNING') {
      return
    }

    this.tick += 1

    const context = this.buildContext()
    const player = this.getFighterById(PLAYER_ID)
    if (player) {
      this.applyPlayerCommand(player, input, context)
    }
    this.applyAwacsEscort()
    this.applyAiCommands(deltaSeconds, context)

    for (const fighter of this.fighters) {
      fighter.update(deltaSeconds, context)
      fighter.move(deltaSeconds)
      fighter.keepInBounds(this.width, this.height)
    }

    // Update RED AWACS dynamic radar range based on HP
    const awacsState = this.getFighterById(AWACS_ID)?.getState()
    if (awacsState?.alive) {
      this.currentAwacsRadarRange = AWACS_MAX_RADAR_RANGE * (awacsState.hp / awacsState.maxHp)
    } else {
      this.currentAwacsRadarRange = 0
    }
    this.awacsRadar.setRange(this.currentAwacsRadarRange)

    const missileContext = this.buildContext()
    for (const missile of this.activeMissiles) {
      missile.update(deltaSeconds, missileContext)
    }

    // Update bombs and collect detonations
    for (const bomb of this.activeBombs) {
      const detonation = bomb.update(deltaSeconds, this.buildContext())
      if (detonation) {
        for (const fighterId of detonation.hitFighterIds) {
          const fighter = this.getFighterById(fighterId)
          if (fighter) {
            fighter.takeDamage(detonation.blastDamage)
            const state = fighter.getState()
            this.createDamagePopup(state.position, detonation.blastDamage, state.team)
          }
        }
      }
    }

    this.resolveHits()
    this.checkFighterCollisions()
    this.recycleDeadMissiles()
    this.recycleDeadBombs()
    this.updateDamagePopups(deltaSeconds)
    this.radarMarks = this.scanRadars()
    this.status = this.combatJudger.updateBattleStatus(this.buildContext())
    if (wasRunning && this.status !== 'RUNNING') {
      this.terminalBattleElapsedMs = Math.floor(performance.now() - this.battleWallStartMs)
    }
  }

  getSnapshot(): BattleSnapshot {
    const fighterStates = this.fighters
      .filter((fighter) => fighter.getState().alive)
      .map((fighter) => fighter.getState())
    const missileStates = this.activeMissiles
      .filter((missile) => missile.getState().alive)
      .map((missile) => missile.getState())
    const bombStates = this.activeBombs
      .filter((bomb) => bomb.getState().alive)
      .map((bomb) => bomb.getState())

    const battleElapsedMs =
      this.status === 'RUNNING'
        ? Math.floor(performance.now() - this.battleWallStartMs)
        : (this.terminalBattleElapsedMs ?? 0)

    return {
      tick: this.tick,
      status: this.status,
      fighters: fighterStates,
      missiles: missileStates,
      bombs: bombStates,
      radarMarks: this.radarMarks.map((mark) => ({
        ...mark,
        position: { ...mark.position },
      })),
      damagePopups: this.damagePopups.map((popup) => ({
        ...popup,
        position: { ...popup.position },
      })),
      redAlive: fighterStates.filter((f) => f.team === 'RED' && f.model !== 'KJ-500').length,
      blueAlive: fighterStates.filter((f) => f.team === 'BLUE' && f.model !== 'KJ-500').length,
      viewport: this.computeViewport(),
      awacsRadarRange: this.currentAwacsRadarRange,
      battleElapsedMs,
    }
  }

  getPlayerId(): string {
    return PLAYER_ID
  }

  getAwacsId(): string {
    return AWACS_ID
  }

  private computeViewport(): Viewport {
    const player = this.getFighterById(PLAYER_ID)?.getState()
    const cx = player ? player.position.x : this.width / 2
    const cy = player ? player.position.y : this.height / 2
    const vw = viewportSize.width
    const vh = viewportSize.height
    return {
      x: Math.max(0, Math.min(this.width - vw, cx - vw / 2)),
      y: Math.max(0, Math.min(this.height - vh, cy - vh / 2)),
      width: vw,
      height: vh,
    }
  }

  private resolveFighterTypeMaxSpeed(model: string): number {
    const cfg = FIGHTER_TYPES[model as FighterType]
    return cfg?.maxSpeed ?? FIGHTER_TYPES[this.fighterType].maxSpeed
  }

  private applyPlayerCommand(player: Fighter, input: InputCommand, context: ReturnType<typeof this.buildContext>): void {
    if (input.moveX !== 0 || input.moveY !== 0) {
      const heading = Math.atan2(input.moveY, input.moveX)
      player.setHeading(heading)
      player.setSpeed(this.resolveFighterTypeMaxSpeed(player.getState().model))
    } else {
      player.setSpeed(0)
    }

    if (input.fire) {
      const targetId = this.pickNearestTarget(player.getState())?.id
      const heading = input.fireHeading ?? player.getState().heading
      this.launchMissile(player, targetId, heading)
    }

    if (input.fireBomb) {
      const heading = input.fireBombHeading ?? player.getState().heading
      this.launchBomb(player, heading)
    }

    void context
  }

  private applyAwacsEscort(): void {
    this.moveAwacsTowardCentroid(AWACS_ID, 'RED')
  }

  private moveAwacsTowardCentroid(awacsId: string, team: 'RED' | 'BLUE'): void {
    const awacs = this.getFighterById(awacsId)
    if (!awacs) {
      return
    }
    const awacsState = awacs.getState()
    if (!awacsState.alive) {
      return
    }

    let sumX = 0
    let sumY = 0
    let count = 0
    for (const fighter of this.fighters) {
      const state = fighter.getState()
      if (state.alive && state.team === team && state.model !== 'KJ-500') {
        sumX += state.position.x
        sumY += state.position.y
        count++
      }
    }

    if (count === 0) {
      awacs.setSpeed(0)
      return
    }

    const targetX = sumX / count
    const targetY = sumY / count
    const dx = targetX - awacsState.position.x
    const dy = targetY - awacsState.position.y
    const dist = Math.hypot(dx, dy)

    if (dist < 80) {
      awacs.setSpeed(0)
      return
    }

    awacs.setHeading(Math.atan2(dy, dx))
    awacs.setSpeed(Math.min(150, Math.max(60, dist * 1.2)))
  }

  private applyAiCommands(deltaSeconds: number, context: ReturnType<typeof this.buildContext>): void {
    for (const fighter of this.fighters) {
      const fighterState = fighter.getState()
      if (!fighterState.alive || fighterState.model === 'KJ-500') {
        continue
      }
      if (fighterState.controlType !== 'AI') {
        continue
      }

      const aiCommand = this.aiController.decide(fighterState, context)
      fighter.turn(aiCommand.turn, deltaSeconds)
      fighter.throttle(aiCommand.throttle, deltaSeconds)
      if (aiCommand.fire) {
        const targetFighter = context.fighters.find((f) => f.id === aiCommand.targetId)
        const heading = targetFighter
          ? Math.atan2(targetFighter.position.y - fighterState.position.y, targetFighter.position.x - fighterState.position.x)
          : fighterState.heading
        this.launchMissile(fighter, aiCommand.targetId, heading)
      }
      if (aiCommand.fireBomb) {
        const targetFighter = context.fighters.find((f) => f.id === aiCommand.targetId)
        const heading = targetFighter
          ? Math.atan2(targetFighter.position.y - fighterState.position.y, targetFighter.position.x - fighterState.position.x)
          : fighterState.heading
        this.launchBomb(fighter, heading)
      }
    }
  }

  private resolveHits(): void {
    const context = this.buildContext()
    const hits = this.combatJudger.judgeHit(context)
    for (const hit of hits) {
      const fighter = this.getFighterById(hit.fighterId)
      const missile = this.activeMissiles.find(
        (m) => m.getState().id === hit.missileId && m.getState().alive,
      )
      if (!fighter || !missile) {
        continue
      }
      fighter.takeDamage(hit.damage)
      const stateAfterHit = fighter.getState()
      this.createDamagePopup(stateAfterHit.position, hit.damage, stateAfterHit.team)
      missile.detonate()
    }
  }

  private checkFighterCollisions(): void {
    const now = Math.floor(performance.now() - this.battleWallStartMs)
    const reds = this.fighters.filter((f) => f.getState().alive && f.getState().team === 'RED')
    const blues = this.fighters.filter((f) => f.getState().alive && f.getState().team === 'BLUE')
    for (const rf of reds) {
      for (const bf of blues) {
        this.consumeFighterPairCollision(now, rf, bf)
      }
    }
    for (let i = 0; i < reds.length; i++) {
      for (let j = i + 1; j < reds.length; j++) {
        this.consumeFighterPairCollision(now, reds[i]!, reds[j]!)
      }
    }
    for (let i = 0; i < blues.length; i++) {
      for (let j = i + 1; j < blues.length; j++) {
        this.consumeFighterPairCollision(now, blues[i]!, blues[j]!)
      }
    }
  }

  /** Same rule as online: each loses 50% of own maxHp; includes AWACS. */
  private consumeFighterPairCollision(nowMs: number, fa: Fighter, fb: Fighter): void {
    const sa = fa.getState()
    const sb = fb.getState()
    if (!sa.alive || !sb.alive) {
      return
    }
    const dist = Math.hypot(sa.position.x - sb.position.x, sa.position.y - sb.position.y)
    if (dist > FIGHTER_COLLISION_DIST) {
      return
    }
    const pairKey = sa.id < sb.id ? `${sa.id}+${sb.id}` : `${sb.id}+${sa.id}`
    const lastTime = this.collisionCooldowns.get(pairKey) ?? -COLLISION_COOLDOWN_MS
    if (nowMs - lastTime < COLLISION_COOLDOWN_MS) {
      return
    }
    this.collisionCooldowns.set(pairKey, nowMs)

    const dmgA = Math.floor(sa.maxHp * 0.5)
    const dmgB = Math.floor(sb.maxHp * 0.5)
    fa.takeDamage(dmgA)
    fb.takeDamage(dmgB)
    this.createDamagePopup(sa.position, dmgA, sa.team)
    this.createDamagePopup(sb.position, dmgB, sb.team)
  }

  private launchMissile(shooter: Fighter, targetId: string | undefined, heading: number): void {
    if (!shooter.consumeMissile()) {
      return
    }

    const shooterState = shooter.getState()
    const missile = this.missilePool.acquire()
    missile.assignTeam(shooterState.team)
    missile.setSpeed(MISSILE_SPEED)

    const typeConfig = FIGHTER_TYPES[shooterState.model as FighterType]
    if (typeConfig) {
      let dmg = typeConfig.missileDamage
      if (shooterState.team === 'BLUE' && shooterState.controlType === 'AI') {
        dmg = Math.max(1, Math.floor(dmg * SINGLE_PLAYER_AI_STAT_FACTOR))
      }
      missile.setDamage(dmg)
    }

    missile.launch(shooterState.position, heading, targetId)
    this.activeMissiles.push(missile)
  }

  private launchBomb(shooter: Fighter, heading: number): void {
    if (!shooter.consumeBomb()) {
      return
    }

    const shooterState = shooter.getState()
    const typeConfig = FIGHTER_TYPES[shooterState.model as FighterType]
    const blastRadiusRaw = typeConfig ? typeConfig.bombRadius : 120
    const blastDamageRaw = typeConfig ? typeConfig.bombDamage : 80
    const weaken = shooterState.team === 'BLUE' && shooterState.controlType === 'AI'
    const blastRadius = weaken ? Math.max(40, Math.floor(blastRadiusRaw * SINGLE_PLAYER_AI_STAT_FACTOR)) : blastRadiusRaw
    const blastDamage = weaken ? Math.max(10, Math.floor(blastDamageRaw * SINGLE_PLAYER_AI_STAT_FACTOR)) : blastDamageRaw

    const bomb = this.bombPool.acquire()
    bomb.assignTeam(shooterState.team)
    bomb.launch(shooterState.position, heading, blastRadius, blastDamage)
    this.activeBombs.push(bomb)
  }

  private createDamagePopup(position: Vector2, damage: number, team: FighterState['team']): void {
    this.popupSeq += 1
    this.damagePopups.push({
      id: `DAMAGE-${this.popupSeq}`,
      position: { ...position },
      damage,
      ttlMs: POPUP_TTL_MS,
      team,
    })
  }

  private updateDamagePopups(deltaSeconds: number): void {
    const elapsedMs = deltaSeconds * 1000
    const active: DamagePopup[] = []
    for (const popup of this.damagePopups) {
      const ttlMs = popup.ttlMs - elapsedMs
      if (ttlMs <= 0) {
        continue
      }
      active.push({
        ...popup,
        ttlMs,
        position: { x: popup.position.x, y: popup.position.y - deltaSeconds * 22 },
      })
    }
    this.damagePopups = active
  }

  private recycleDeadMissiles(): void {
    const kept: Missile[] = []
    for (const missile of this.activeMissiles) {
      if (missile.getState().alive) {
        kept.push(missile)
      } else {
        this.missilePool.release(missile)
      }
    }
    this.activeMissiles = kept
  }

  private recycleDeadBombs(): void {
    const kept: Bomb[] = []
    for (const bomb of this.activeBombs) {
      if (bomb.getState().alive) {
        kept.push(bomb)
      } else {
        this.bombPool.release(bomb)
      }
    }
    this.activeBombs = kept
  }

  private scanRadars(): RadarMark[] {
    const fighters = this.fighters.map((f) => f.getState())
    const player = fighters.find((f) => f.id === PLAYER_ID)
    const redAwacs = fighters.find((f) => f.id === AWACS_ID)
    const merged: RadarMark[] = []
    const pushed = new Set<string>()

    if (player?.alive) {
      for (const mark of this.playerRadar.scan(player, fighters)) {
        if (!pushed.has(mark.targetId)) {
          pushed.add(mark.targetId)
          merged.push(mark)
        }
      }
    }

    if (redAwacs?.alive) {
      for (const mark of this.awacsRadar.scan(redAwacs, fighters)) {
        if (!pushed.has(mark.targetId)) {
          pushed.add(mark.targetId)
          merged.push(mark)
        }
      }
    }

    return merged
  }

  private pickNearestTarget(source: FighterState): FighterState | undefined {
    let nearest: FighterState | undefined
    let nearestDist = Number.MAX_SAFE_INTEGER

    for (const fighter of this.fighters) {
      const state = fighter.getState()
      if (!state.alive || state.team === source.team) {
        continue
      }
      const dist = Math.hypot(state.position.x - source.position.x, state.position.y - source.position.y)
      if (dist < nearestDist) {
        nearestDist = dist
        nearest = state
      }
    }

    return nearest
  }

  private buildContext() {
    return {
      tick: this.tick,
      fighters: this.fighters.map((f) => f.getState()),
      missiles: this.activeMissiles.map((m) => m.getState()),
      bombs: this.activeBombs.map((b) => b.getState()),
      radarMarks: this.radarMarks.map((mark) => ({ ...mark, position: { ...mark.position } })),
      status: this.status,
      worldWidth: this.width,
      worldHeight: this.height,
    }
  }

  private getFighterById(id: string): Fighter | undefined {
    return this.fighters.find((f) => f.getState().id === id)
  }

  private spawnFriendlyUnits(): void {
    const typeConfig = FIGHTER_TYPES[this.fighterType]
    const playerConfig: FighterConfig = {
      id: PLAYER_ID,
      team: 'RED',
      controlType: 'PLAYER',
      model: this.fighterType,
      position: { x: this.width * 0.35, y: this.height * 0.55 },
      heading: -Math.PI / 2,
      speed: 120,
      hp: typeConfig.hp,
      maxHp: typeConfig.hp,
      missileCount: typeConfig.missileCount,
      bombCount: typeConfig.bombCount,
      maxSpeed: typeConfig.maxSpeed,
      minSpeed: typeConfig.minSpeed,
      turnRate: typeConfig.turnRate,
      acceleration: typeConfig.acceleration,
      fireCooldownMs: typeConfig.fireCooldownMs,
    }
    const redAwacsConfig: FighterConfig = {
      id: AWACS_ID,
      team: 'RED',
      controlType: 'AI',
      model: 'KJ-500',
      position: { x: this.width * 0.20, y: this.height * 0.65 },
      heading: -Math.PI / 2,
      speed: 90,
      hp: 260,
      maxHp: 260,
      missileCount: 0,
      bombCount: 0,
      maxSpeed: 150,
      minSpeed: 70,
      turnRate: Math.PI * 0.35,
      acceleration: 40,
      fireCooldownMs: 9999,
    }

    this.fighters.push(new Fighter(playerConfig), new Fighter(redAwacsConfig))
  }

  private spawnBlueAiSquad(): void {
    const AI_MODELS = Object.keys(FIGHTER_TYPES) as FighterType[]
    const count = ENEMY_COUNT_MAP[this.difficulty]
    const f = SINGLE_PLAYER_AI_STAT_FACTOR
    const weakenedInt = (n: number, minVal = 1): number => Math.max(minVal, Math.floor(n * f))
    for (let i = 0; i < count; i += 1) {
      const spawn = this.randomEdgeSpawnPoint()
      const model = AI_MODELS[Math.floor(Math.random() * AI_MODELS.length)]
      const cfg = FIGHTER_TYPES[model]
      const minSpeed = weakenedInt(cfg.minSpeed, 36)
      const maxSpeed = Math.max(minSpeed + 5, weakenedInt(cfg.maxSpeed, 40))
      this.fighters.push(
        new Fighter({
          id: `BLUE-AI-${i + 1}`,
          team: 'BLUE',
          controlType: 'AI',
          model,
          position: spawn.position,
          heading: spawn.heading,
          speed: minSpeed + Math.random() * Math.max(8, maxSpeed - minSpeed),
          hp: weakenedInt(cfg.hp, 20),
          maxHp: weakenedInt(cfg.hp, 20),
          missileCount: weakenedInt(cfg.missileCount, 1),
          bombCount: Math.max(0, Math.floor(cfg.bombCount * f)),
          maxSpeed,
          minSpeed,
          turnRate: cfg.turnRate * f,
          acceleration: Math.max(35, weakenedInt(cfg.acceleration, 35)),
          fireCooldownMs: Math.round(cfg.fireCooldownMs / f),
        }),
      )
    }
  }

  private randomEdgeSpawnPoint(): { position: Vector2; heading: number } {
    const edge = Math.floor(Math.random() * 4)
    const offset = Math.random()
    const margin = 8

    if (edge === 0) {
      return { position: { x: offset * this.width, y: margin }, heading: Math.PI / 2 }
    }
    if (edge === 1) {
      return { position: { x: this.width - margin, y: offset * this.height }, heading: Math.PI }
    }
    if (edge === 2) {
      return { position: { x: offset * this.width, y: this.height - margin }, heading: -Math.PI / 2 }
    }
    return { position: { x: margin, y: offset * this.height }, heading: 0 }
  }
}
