import { normalizeBackendRoot, coerceLastBattleSummaryFromWsFinish, type LastBattleSummaryDto } from '../api/roomApi'
import { invalidateSessionFromApi } from '../api/sessionGuard'
import { ONLINE_INPUT_PUMP_MS } from '../shared/onlineGameConfig'
import { augmentInputWithWorldFireAngles } from './augmentInputFireHeading'
import { InputController } from './InputController'
import type { BattleSnapshot, NetworkMessage } from '../game/types'
import { JsonNetworkProtocol } from '../game/JsonNetworkProtocol'
import { createInitialBattleSnapshot } from './battleSnapshotDefaults'
import { normalizeBattleSnapshot } from './normalizeBattleSnapshot'
import { presentOnlineBattleSnapshot } from './presentOnlineBattleSnapshot'

interface FrameState {
  snapshot: BattleSnapshot
  fps: number
}

type FrameListener = (state: FrameState) => void
type BattleFinishListener = (summary: LastBattleSummaryDto | null) => void

export class OnlineGameController {
  private readonly baseUrl: string
  private readonly token: string
  private readonly roomId: number
  private readonly inputController = new InputController()
  private readonly networkProtocol = new JsonNetworkProtocol()
  private listeners: FrameListener[] = []
  private socket: WebSocket | null = null
  private snapshot: BattleSnapshot = createInitialBattleSnapshot()
  private running = false
  private sendTimer: number | null = null
  private boundCanvas: HTMLCanvasElement | null = null
  private playerFighterId = ''
  private lastRawSnapshot: BattleSnapshot | null = null
  private battleFinishListener: BattleFinishListener | null = null
  private lastAppliedTick = -1

  constructor(baseUrl: string, token: string, roomId: number) {
    this.baseUrl = baseUrl
    this.token = token
    this.roomId = roomId
  }

  start(): void {
    if (this.running) {
      return
    }
    this.running = true
    this.openSocket()
    this.startInputPump()
  }

  stop(): void {
    this.running = false
    this.inputController.detach()
    if (this.sendTimer != null) {
      window.clearInterval(this.sendTimer)
      this.sendTimer = null
    }
    if (this.socket) {
      this.socket.close()
      this.socket = null
    }
  }

  bindCanvas(canvas: HTMLCanvasElement): void {
    this.boundCanvas = canvas
    this.inputController.attach(canvas)
  }

  setPlayerFighterId(fighterId: string): void {
    this.playerFighterId = fighterId
    if (this.lastRawSnapshot) {
      presentOnlineBattleSnapshot(this.lastRawSnapshot, fighterId)
      this.snapshot = this.lastRawSnapshot
      this.flushNotify()
    }
  }

  onFrame(listener: FrameListener): () => void {
    this.listeners.push(listener)
    listener({ snapshot: this.snapshot, fps: 0 })
    return () => {
      this.listeners = this.listeners.filter((item) => item !== listener)
    }
  }

  /** Post-game statistics mirror from server (preferred over REST to avoid races). */
  onBattleFinished(listener: BattleFinishListener): () => void {
    this.battleFinishListener = listener
    return () => {
      if (this.battleFinishListener === listener) {
        this.battleFinishListener = null
      }
    }
  }

  private openSocket(): void {
    const wsBase = normalizeBackendRoot(this.baseUrl)
      .replace(/^http:/, 'ws:')
      .replace(/^https:/, 'wss:')
    this.socket = new WebSocket(
      `${wsBase}/ws/game?token=${encodeURIComponent(this.token)}&roomId=${this.roomId}`,
    )
    this.socket.onopen = () => {
      if (this.boundCanvas) {
        this.inputController.attach(this.boundCanvas)
      }
    }
    this.socket.onclose = (ev: CloseEvent) => {
      if (!this.running) {
        return
      }
      if (ev.code === 4001) {
        window.alert('登录会话已失效（可能在其它地点登录或已注销），请重新登录。')
        invalidateSessionFromApi()
      } else if (ev.code === 4000) {
        window.alert('该账号已在其它页面连接本房间，本页连接已断开。')
      }
      this.stop()
    }
    this.socket.onmessage = (event) => {
      try {
        const message = this.networkProtocol.deserialize(event.data as string)
        if (message.type === 'MSG_ROOM_EVENT') {
          const envelope = message.payload as { event?: string; payload?: Record<string, unknown> }
          const ev = envelope?.event
          const inner = envelope?.payload ?? {}
          if (ev === 'BATTLE_FINISHED' && Number(inner.roomId ?? this.roomId) === this.roomId) {
            const dto = coerceLastBattleSummaryFromWsFinish(inner)
            if (dto && this.battleFinishListener) {
              this.battleFinishListener(dto)
            }
          }
        }
        if (message.type === 'MSG_BATTLE_STATUS') {
          const raw = normalizeBattleSnapshot(message.payload as Record<string, unknown>)
          const prev = this.lastRawSnapshot
          if (
            prev != null &&
            raw.tick === this.lastAppliedTick &&
            raw.status === prev.status
          ) {
            return
          }
          this.lastAppliedTick = raw.tick
          this.lastRawSnapshot = raw
          presentOnlineBattleSnapshot(raw, this.playerFighterId)
          this.snapshot = raw
          this.flushNotify()
        }
      } catch {
        // 忽略非法消息，避免中断渲染
      }
    }
  }

  private startInputPump(): void {
    this.sendTimer = window.setInterval(() => {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        return
      }
      const raw = this.inputController.consume()
      const mc = this.inputController.getMouseCanvasLocal()
      const command = this.playerFighterId
        ? augmentInputWithWorldFireAngles(raw, this.snapshot, this.playerFighterId, mc.x, mc.y)
        : raw
      const message: NetworkMessage = {
        type: 'MSG_PLAYER_INPUT',
        roomId: this.roomId,
        payload: {
          moveX: command.moveX,
          moveY: command.moveY,
          fire: command.fire,
          fireBomb: command.fireBomb,
          fireHeading: command.fireHeading ?? null,
          fireBombHeading: command.fireBombHeading ?? null,
          targetId: null,
        },
      }
      this.socket.send(this.networkProtocol.serialize(message))
    }, ONLINE_INPUT_PUMP_MS)
  }

  private flushNotify(): void {
    const state: FrameState = { snapshot: this.snapshot, fps: 0 }
    for (const listener of this.listeners) {
      listener(state)
    }
  }
}
