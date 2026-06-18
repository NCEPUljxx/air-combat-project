import type {
  AICommand,
  AIDifficulty,
  BattlefieldContext,
  BattleSnapshot,
  BattleStatus,
  FighterState,
  HitResult,
  InputCommand,
  MessageType,
  MissileState,
  NetworkMessage,
  RadarMark,
  Vector2,
} from './types'

export interface IFighter {
  move(deltaSeconds: number): void
  fire(targetId?: string): IMissile | null
  takeDamage(amount: number): void
  update(deltaSeconds: number, battlefield: BattlefieldContext): void
  getState(): FighterState
}

export interface IMissile {
  launch(origin: Vector2, heading: number, targetId?: string): void
  track(target: FighterState | null, deltaSeconds: number): void
  detonate(): void
  update(deltaSeconds: number, battlefield: BattlefieldContext): void
  getState(): MissileState
}

export interface IRadarSystem {
  scan(observer: FighterState, targets: FighterState[]): RadarMark[]
  getDetectedTargets(): RadarMark[]
  setRange(range: number): void
}

export interface ICombatJudger {
  checkCollision(missile: MissileState, fighter: FighterState): boolean
  judgeHit(battlefield: BattlefieldContext): HitResult[]
  updateBattleStatus(battlefield: BattlefieldContext): BattleStatus
}

export interface IAIController {
  decide(self: FighterState, battlefield: BattlefieldContext): AICommand
  execute(command: AICommand, fighter: IFighter): void
  setDifficulty(level: AIDifficulty): void
}

export interface INetworkProtocol<T = unknown> {
  serialize(message: NetworkMessage<T>): string
  deserialize(raw: string): NetworkMessage<T>
  getMessageType(raw: string): MessageType
}

export interface GameController {
  start(): void
  stop(): void
  handleInput(command: InputCommand): void
  getSnapshot(): BattleSnapshot
}
