<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import BattleCanvas from '../components/BattleCanvas.vue'
import GameHud from '../components/GameHud.vue'
import type { BattleSnapshot } from '../game/types'
import { createInitialBattleSnapshot } from '../controllers/battleSnapshotDefaults'
import { OnlineGameController } from '../controllers/OnlineGameController'
import { currentUserState } from '../stores/authStore'
import { currentRoomState } from '../stores/roomStore'
import { getLastBattleSummaryApi, leaveRoomApi, type LastBattleSummaryDto } from '../api/roomApi'

const props = defineProps<{
  backendUrl: string
  token: string
  roomId: number
}>()

const emit = defineEmits<{
  exit: []
}>()

const controller = new OnlineGameController(props.backendUrl, props.token, props.roomId)
const snapshot = shallowRef<BattleSnapshot>(createInitialBattleSnapshot())
const renderFps = ref(0)
const playerId = computed(() => {
  const currentUserId = currentUserState.value?.id
  if (!currentUserId) {
    return ''
  }
  return currentRoomState.value?.players.find((player) => Number(player.userId) === Number(currentUserId))
    ?.fighterId ?? ''
})
watch(
  playerId,
  (pid) => {
    controller.setPlayerFighterId(pid ?? '')
  },
  { immediate: true },
)
const isBattleEnded = computed(() => snapshot.value.status !== 'WAITING' && snapshot.value.status !== 'RUNNING')

const lastBattleSummary = ref<LastBattleSummaryDto | null>(null)
const battleSummaryLoading = ref(false)
const battleSummaryError = ref<string | null>(null)

let battleSummaryFetched = false

watch(isBattleEnded, async (ended) => {
  if (!ended) {
    lastBattleSummary.value = null
    battleSummaryError.value = null
    battleSummaryLoading.value = false
    battleSummaryFetched = false
    return
  }
  if (battleSummaryFetched) {
    return
  }
  battleSummaryFetched = true
  battleSummaryLoading.value = true
  battleSummaryError.value = null
  try {
    lastBattleSummary.value = await getLastBattleSummaryApi(props.backendUrl, props.token, props.roomId)
  } catch (err) {
    battleSummaryError.value = err instanceof Error ? err.message : '战后统计加载失败'
  } finally {
    battleSummaryLoading.value = false
  }
})

const teamOf = (team: string | undefined): string => (team ?? '').trim().toUpperCase()

const summaryRedPlayers = computed(
  () => lastBattleSummary.value?.players.filter((p) => teamOf(p.team) === 'RED') ?? [],
)
const summaryBluePlayers = computed(
  () => lastBattleSummary.value?.players.filter((p) => teamOf(p.team) === 'BLUE') ?? [],
)

const formatMmSsMs = (ms: number): string => {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

const onRenderFps = (value: number): void => {
  renderFps.value = value
}

let disposeFrameListener: (() => void) | undefined
let disposeFinishListener: (() => void) | undefined

const onCanvasReady = (canvas: HTMLCanvasElement): void => {
  controller.bindCanvas(canvas)
}

/** 仅在对局未结束（RUNNING / 视口内初始 WAITING）时，房主主动退出战场才解散房间；终局后返回大厅与普通成员一致，保留房间可再战 */
const onExit = async (userInitiated: boolean): Promise<void> => {
  clearReturnLobbyTimer()
  controller.stop()
  if (userInitiated) {
    const status = snapshot.value.status
    const battleOngoing = status === 'RUNNING' || status === 'WAITING'
    const uid = currentUserState.value?.id
    const room = currentRoomState.value
    if (
      battleOngoing &&
      room != null &&
      uid != null &&
      Number(room.ownerUserId) === Number(uid)
    ) {
      try {
        await leaveRoomApi(props.backendUrl, props.token, props.roomId)
        currentRoomState.value = null
      } catch {
        /* 失败时仍回大厅；用户可在房间页再次点击离开；401 由 API 层处理 */
      }
    }
  }
  emit('exit')
}

const returnLobbySeconds = ref(0)
let returnLobbyTimer: ReturnType<typeof setInterval> | null = null

const clearReturnLobbyTimer = (): void => {
  if (returnLobbyTimer !== null) {
    clearInterval(returnLobbyTimer)
    returnLobbyTimer = null
  }
}

watch(isBattleEnded, (ended) => {
  clearReturnLobbyTimer()
  if (!ended) {
    returnLobbySeconds.value = 0
    return
  }
  returnLobbySeconds.value = 8
  returnLobbyTimer = window.setInterval(() => {
    returnLobbySeconds.value -= 1
    if (returnLobbySeconds.value <= 0) {
      clearReturnLobbyTimer()
      void onExit(false)
    }
  }, 1000)
})

onMounted(() => {
  disposeFinishListener = controller.onBattleFinished((dto) => {
    if (!dto?.battleRecordId) {
      return
    }
    lastBattleSummary.value = dto
    battleSummaryLoading.value = false
    battleSummaryError.value = null
    battleSummaryFetched = true
  })
  disposeFrameListener = controller.onFrame((state) => {
    snapshot.value = state.snapshot
  })
  controller.start()
})

onBeforeUnmount(() => {
  clearReturnLobbyTimer()
  disposeFinishListener?.()
  disposeFrameListener?.()
  controller.stop()
})
</script>

<template>
  <main class="game-view">
    <header class="game-topbar">
      <div>
        <h1>模拟空战 · 联机模式</h1>
        <p>房间 {{ roomId }} / 后端权威快照渲染</p>
      </div>
      <div class="game-topbar-actions">
        <button type="button" class="ghost-button" @click="void onExit(true)">返回房间</button>
      </div>
    </header>

    <section class="game-layout">
      <BattleCanvas
        :snapshot="snapshot"
        :fps="renderFps"
        :player-id="playerId"
        continuous-raf-render
        @canvas-ready="onCanvasReady"
        @render-fps="onRenderFps"
      />
      <GameHud
        :snapshot="snapshot"
        :fps="renderFps"
        :player-id="playerId"
        difficulty="NORMAL"
      />
    </section>

    <div v-if="isBattleEnded" class="result-modal">
      <div class="result-panel result-panel--wide">
        <h2>联机对局结束</h2>
        <p v-if="snapshot.status === 'RED_WIN'">红方胜利</p>
        <p v-else-if="snapshot.status === 'BLUE_WIN'">蓝方胜利</p>
        <p v-else-if="snapshot.status === 'DRAW'">平局：双方战斗机构同时清空</p>
        <p v-else>对战已结束</p>
        <p>红方剩余 {{ snapshot.redAlive }} 架，蓝方剩余 {{ snapshot.blueAlive }} 架</p>
        <p>本场用时：<strong>{{ formatMmSsMs(snapshot.battleElapsedMs) }}</strong></p>

        <p v-if="battleSummaryLoading" class="battle-summary-hint">正在加载战后统计…</p>
        <p v-else-if="battleSummaryError" class="battle-summary-hint battle-summary-hint--error">{{ battleSummaryError }}</p>
        <div
          v-else-if="lastBattleSummary && lastBattleSummary.battleRecordId != null"
          class="battle-summary-block"
        >
          <p v-if="lastBattleSummary.durationSeconds != null" class="battle-meta">
            记录时长：<strong>{{ formatMmSsMs(lastBattleSummary.durationSeconds * 1000) }}</strong>
            <span v-if="lastBattleSummary.winner"> · 胜者：{{ lastBattleSummary.winner }}</span>
          </p>
          <section class="battle-summary-team">
            <h3 class="battle-summary-heading battle-summary-heading--red">红方真人</h3>
            <table class="battle-summary-table">
              <thead>
                <tr>
                  <th>昵称</th>
                  <th>机型</th>
                  <th>伤害</th>
                  <th>击落</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in summaryRedPlayers" :key="row.userId">
                  <td>{{ row.nickname || '—' }}</td>
                  <td>{{ row.fighterModel || '—' }}</td>
                  <td>{{ row.damageDealt }}</td>
                  <td>{{ row.kills }}</td>
                </tr>
                <tr v-if="summaryRedPlayers.length === 0">
                  <td colspan="4" class="battle-summary-empty">本局红方无真人玩家记录</td>
                </tr>
              </tbody>
            </table>
          </section>
          <section class="battle-summary-team">
            <h3 class="battle-summary-heading battle-summary-heading--blue">蓝方真人</h3>
            <table class="battle-summary-table">
              <thead>
                <tr>
                  <th>昵称</th>
                  <th>机型</th>
                  <th>伤害</th>
                  <th>击落</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in summaryBluePlayers" :key="row.userId">
                  <td>{{ row.nickname || '—' }}</td>
                  <td>{{ row.fighterModel || '—' }}</td>
                  <td>{{ row.damageDealt }}</td>
                  <td>{{ row.kills }}</td>
                </tr>
                <tr v-if="summaryBluePlayers.length === 0">
                  <td colspan="4" class="battle-summary-empty">本局蓝方无真人玩家记录</td>
                </tr>
              </tbody>
            </table>
          </section>
        </div>
        <p
          v-else-if="!battleSummaryLoading && !battleSummaryError && isBattleEnded"
          class="battle-summary-hint"
        >
          暂无本局真人战报（或战报尚未写入）
        </p>

        <p v-if="returnLobbySeconds > 0" class="battle-summary-hint return-lobby-hint">
          {{ returnLobbySeconds }} 秒后自动返回房间大厅…
        </p>

        <div class="result-actions">
          <button type="button" class="ghost-button secondary" @click="void onExit(true)">立即返回房间</button>
        </div>
      </div>
    </div>
  </main>
</template>
