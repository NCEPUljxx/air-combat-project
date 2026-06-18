<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  createRoomApi,
  joinRoomApi,
  leaveRoomApi,
  getRoomApi,
  listRoomsApi,
  normalizeBackendRoot,
  selectModelApi,
  selectTeamApi,
  startRoomApi,
  getBattleHistoryApi,
  getMyBattleHistoryApi,
  getGlobalBattleHistoryApi,
  type LastBattleSummaryDto,
  type PlayerBattleRow,
  type RoomDto,
} from '../api/roomApi'
import { logoutApi, sendLogoutBeacon } from '../api/authApi'
import { authTokenState, backendUrlState, clearAuthState, currentUserState } from '../stores/authStore'
import { currentRoomState, roomListState } from '../stores/roomStore'
import type { FighterType } from '../shared/battlefieldConfig'
import { FIGHTER_TYPES, FIGHTER_TYPE_LIST } from '../shared/battlefieldConfig'

const emit = defineEmits<{
  back: []
  enterOnline: [payload: { backendUrl: string; token: string; roomId: number }]
}>()

const roomName = ref('')
const error = ref('')
const loading = ref(false)
const selectedModel = ref<FighterType>('J-20')
/** wall-clock countdown end (ms); 0 = inactive */
const countdownEndsAtMs = ref(0)
const countdownSeconds = ref(0)
let pollTimer: ReturnType<typeof setInterval> | null = null
let lobbySocket: WebSocket | null = null
let countdownDisplayTimer: ReturnType<typeof setInterval> | null = null
const navigatingToBattle = ref(false)
const battleHistory = ref<LastBattleSummaryDto[]>([])
const battleHistoryLoading = ref(false)
const myBattleHistory = ref<LastBattleSummaryDto[]>([])
const myBattleHistoryLoading = ref(false)
const globalBattleHistory = ref<LastBattleSummaryDto[]>([])
const globalBattleHistoryLoading = ref(false)

type HistoryDlgTab = 'my' | 'global' | 'room'
const historyDialogEl = ref<HTMLDialogElement | null>(null)
const historyDlgTab = ref<HistoryDlgTab>('my')

const activeHistoryRows = computed(() => {
  if (historyDlgTab.value === 'my') return myBattleHistory.value
  if (historyDlgTab.value === 'global') return globalBattleHistory.value
  return battleHistory.value
})

const activeHistoryLoading = computed(() => {
  if (historyDlgTab.value === 'my') return myBattleHistoryLoading.value
  if (historyDlgTab.value === 'global') return globalBattleHistoryLoading.value
  return battleHistoryLoading.value
})

const loadGlobalBattleHistoryPanel = async (): Promise<void> => {
  const token = authTokenState.value
  const baseUrl = backendUrlState.value
  if (!token || !baseUrl.trim()) {
    globalBattleHistory.value = []
    return
  }
  globalBattleHistoryLoading.value = true
  try {
    globalBattleHistory.value = await getGlobalBattleHistoryApi(baseUrl, token, 80)
  } catch {
    globalBattleHistory.value = []
  } finally {
    globalBattleHistoryLoading.value = false
  }
}

const loadMyBattleHistoryPanel = async (): Promise<void> => {
  const token = authTokenState.value
  const baseUrl = backendUrlState.value
  if (!token || !baseUrl.trim()) {
    myBattleHistory.value = []
    return
  }
  myBattleHistoryLoading.value = true
  try {
    myBattleHistory.value = await getMyBattleHistoryApi(baseUrl, token, 50)
  } catch {
    myBattleHistory.value = []
  } finally {
    myBattleHistoryLoading.value = false
  }
}

const loadBattleHistoryPanel = async (): Promise<void> => {
  const room = currentRoomState.value
  const token = authTokenState.value
  const baseUrl = backendUrlState.value
  if (!room || !token) {
    battleHistory.value = []
    return
  }
  battleHistoryLoading.value = true
  try {
    battleHistory.value = await getBattleHistoryApi(baseUrl, token, room.id)
  } catch {
    battleHistory.value = []
  } finally {
    battleHistoryLoading.value = false
  }
}

const prepHistoryTabData = async (tab: HistoryDlgTab): Promise<void> => {
  if (tab === 'my') {
    await loadMyBattleHistoryPanel()
  } else if (tab === 'global') {
    await loadGlobalBattleHistoryPanel()
  } else {
    await loadBattleHistoryPanel()
  }
}

const openHistoryDialog = async (tab: HistoryDlgTab): Promise<void> => {
  historyDlgTab.value = tab
  await prepHistoryTabData(tab)
  await nextTick()
  historyDialogEl.value?.showModal()
}

const switchHistoryTab = async (tab: HistoryDlgTab): Promise<void> => {
  if (historyDlgTab.value === tab) return
  historyDlgTab.value = tab
  await prepHistoryTabData(tab)
}

const closeHistoryDialog = (): void => {
  historyDialogEl.value?.close()
}

const formatWinnerLabel = (winner: string | null): string => {
  if (!winner?.trim()) {
    return '—'
  }
  const u = winner.trim().toUpperCase()
  if (u === 'RED') {
    return '红方'
  }
  if (u === 'BLUE') {
    return '蓝方'
  }
  if (u === 'DRAW') {
    return '平局'
  }
  return winner
}

const formatDurationMmSs = (sec: number | null): string => {
  if (sec == null || Number.isNaN(sec)) {
    return '—'
  }
  const s = Math.max(0, Math.floor(sec))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${r.toString().padStart(2, '0')}`
}

const formatBattleEndedShort = (iso: string | null | undefined): string => {
  if (!iso?.trim()) {
    return '—'
  }
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) {
      return iso
    }
    return d.toLocaleString()
  } catch {
    return iso
  }
}

const redRows = (players: PlayerBattleRow[]): PlayerBattleRow[] =>
  players.filter((p) => String(p.team).toUpperCase() === 'RED')

const blueRows = (players: PlayerBattleRow[]): PlayerBattleRow[] =>
  players.filter((p) => String(p.team).toUpperCase() === 'BLUE')

const syncCountdownSeconds = (): void => {
  const end = countdownEndsAtMs.value
  if (end <= 0) {
    countdownSeconds.value = 0
    return
  }
  countdownSeconds.value = Math.max(0, Math.ceil((end - Date.now()) / 1000))
}

const ensureCountdownTicker = (): void => {
  if (countdownDisplayTimer !== null) {
    return
  }
  countdownDisplayTimer = window.setInterval(() => {
    syncCountdownSeconds()
    if (countdownEndsAtMs.value > 0 && countdownSeconds.value <= 0) {
      clearCountdownDisplay()
    }
  }, 200)
}

const isOwner = computed(
  () =>
    Number(currentRoomState.value?.ownerUserId) === Number(currentUserState.value?.id),
)

const canStart = computed(() =>
  isOwner.value && currentRoomState.value?.status === 'WAITING' && !loading.value && countdownSeconds.value === 0,
)

const refreshRooms = async (): Promise<void> => {
  roomListState.value = await listRoomsApi(backendUrlState.value)
  const rid = currentRoomState.value?.id
  if (rid != null) {
    try {
      currentRoomState.value = await getRoomApi(backendUrlState.value, rid)
    } catch {
      // 当前房间可能被删除或未授权，沿用列表快照
    }
  }
}

const teardownLobbyWs = (): void => {
  if (lobbySocket) {
    lobbySocket.close()
    lobbySocket = null
  }
}

const clearCountdownDisplay = (): void => {
  if (countdownDisplayTimer) {
    clearInterval(countdownDisplayTimer)
    countdownDisplayTimer = null
  }
  countdownEndsAtMs.value = 0
  countdownSeconds.value = 0
}

const wsEndpoint = (base: string): string =>
  normalizeBackendRoot(base).replace(/^http:/, 'ws:').replace(/^https:/, 'wss:')

const connectLobbyWs = (): void => {
  teardownLobbyWs()

  const room = currentRoomState.value
  const token = authTokenState.value
  const baseUrl = backendUrlState.value
  if (!room || !token || !baseUrl.trim()) {
    return
  }

  try {
    const wsUrl = `${wsEndpoint(baseUrl)}/ws/game?token=${encodeURIComponent(token)}&roomId=${room.id}`
    const ws = new WebSocket(wsUrl)
    lobbySocket = ws

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as {
          type?: string
          payload?: { event?: string; payload?: Record<string, unknown> }
        }
        if (msg.type !== 'MSG_ROOM_EVENT') {
          return
        }
        const ev = msg.payload?.event
        const inner = msg.payload?.payload

        if (ev === 'MATCH_COUNTDOWN') {
          const secs = Math.max(1, Math.round(Number(inner?.seconds ?? 3)))
          countdownEndsAtMs.value = Date.now() + secs * 1000
          syncCountdownSeconds()
          ensureCountdownTicker()
        }

        if (ev === 'BATTLE_STARTED') {
          clearCountdownDisplay()
          const myRoomId = currentRoomState.value?.id
          if (myRoomId == null) {
            return
          }
          const ridMsg =
            inner?.roomId != null && inner.roomId !== '' ? Number(inner.roomId) : myRoomId
          if (Number.isNaN(ridMsg) || ridMsg !== myRoomId) {
            return
          }
          if (!navigatingToBattle.value) {
            navigatingToBattle.value = true
            enterOnline()
          }
        }

        if (ev === 'ROOM_EXPIRED') {
          clearCountdownDisplay()
          const myRoomId = currentRoomState.value?.id
          if (myRoomId == null) {
            return
          }
          const ridMsg =
            inner?.roomId != null && inner.roomId !== '' ? Number(inner.roomId) : myRoomId
          if (Number.isNaN(ridMsg) || ridMsg !== myRoomId) {
            return
          }
          navigatingToBattle.value = false
          teardownLobbyWs()
          currentRoomState.value = null
          void refreshRooms()
          const reason = inner?.reason != null ? String(inner.reason) : ''
          if (reason === 'OWNER_LEFT') {
            error.value = '房主已离开，房间已关闭'
          } else if (reason === 'STALE_TIMEOUT') {
            error.value = '该房间已超过 10 分钟未活动，已自动解散'
          } else {
            error.value = '该房间已关闭'
          }
        }

        if (ev === 'BATTLE_FINISHED') {
          const myRoomId = currentRoomState.value?.id
          if (myRoomId == null) {
            return
          }
          const ridMsg =
            inner?.roomId != null && inner.roomId !== '' ? Number(inner.roomId) : myRoomId
          if (Number.isNaN(ridMsg) || ridMsg !== myRoomId) {
            return
          }
          void refreshRooms()
        }
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
}


const load = async (): Promise<void> => {
  error.value = ''
  loading.value = true
  try {
    await refreshRooms()
  } catch (exception) {
    error.value = exception instanceof Error ? exception.message : '房间列表加载失败'
  } finally {
    loading.value = false
  }
}

const requireToken = (): string => {
  if (!authTokenState.value) {
    throw new Error('请先登录')
  }
  return authTokenState.value
}

const createRoom = async (): Promise<void> => {
  error.value = ''
  loading.value = true
  try {
    currentRoomState.value = await createRoomApi(backendUrlState.value, requireToken(), roomName.value.trim())
    await refreshRooms()
  } catch (exception) {
    error.value = exception instanceof Error ? exception.message : '创建房间失败'
  } finally {
    loading.value = false
  }
}

const joinRoom = async (room: RoomDto, team: 'RED' | 'BLUE'): Promise<void> => {
  error.value = ''
  loading.value = true
  try {
    currentRoomState.value = await joinRoomApi(backendUrlState.value, requireToken(), room.id, team)
    await refreshRooms()
  } catch (exception) {
    error.value = exception instanceof Error ? exception.message : '加入房间失败'
  } finally {
    loading.value = false
  }
}

const selectTeam = async (team: 'RED' | 'BLUE'): Promise<void> => {
  if (!currentRoomState.value) {
    return
  }
  error.value = ''
  loading.value = true
  try {
    currentRoomState.value = await selectTeamApi(
      backendUrlState.value,
      requireToken(),
      currentRoomState.value.id,
      team,
    )
    await refreshRooms()
  } catch (exception) {
    error.value = exception instanceof Error ? exception.message : '切换队伍失败'
  } finally {
    loading.value = false
  }
}

const leaveRoom = async (): Promise<void> => {
  if (!currentRoomState.value) {
    return
  }
  error.value = ''
  loading.value = true
  try {
    await leaveRoomApi(backendUrlState.value, requireToken(), currentRoomState.value.id)
    navigatingToBattle.value = false
    teardownLobbyWs()
    clearCountdownDisplay()
    currentRoomState.value = null
    await refreshRooms()
  } catch (exception) {
    error.value = exception instanceof Error ? exception.message : '离开房间失败'
  } finally {
    loading.value = false
  }
}

const chooseModel = async (model: FighterType): Promise<void> => {
  selectedModel.value = model
  if (!currentRoomState.value) {
    return
  }
  try {
    await selectModelApi(backendUrlState.value, requireToken(), currentRoomState.value.id, model)
  } catch {
    // 选机型失败不阻断流程
  }
}

const enterOnline = (): void => {
  if (!currentRoomState.value || !authTokenState.value) {
    return
  }
  emit('enterOnline', {
    backendUrl: backendUrlState.value,
    token: authTokenState.value,
    roomId: currentRoomState.value.id,
  })
}

const startRoom = async (): Promise<void> => {
  if (!currentRoomState.value) {
    return
  }
  error.value = ''
  loading.value = true
  try {
    currentRoomState.value = await startRoomApi(backendUrlState.value, requireToken(), currentRoomState.value.id)
    await refreshRooms()
  } catch (exception) {
    error.value = exception instanceof Error ? exception.message : '开始房间失败'
  } finally {
    loading.value = false
  }
}

const logout = async (): Promise<void> => {
  const base = backendUrlState.value
  const tok = authTokenState.value
  const room = currentRoomState.value
  teardownLobbyWs()
  clearCountdownDisplay()
  navigatingToBattle.value = false
  if (room && tok && base.trim()) {
    try {
      await leaveRoomApi(base, tok, room.id)
    } catch {
      // 仍继续注销
    }
  }
  if (tok && base.trim()) {
    try {
      await logoutApi(base, tok)
    } catch {
      // 仍清空本地会话
    }
    sendLogoutBeacon(base, tok)
  }
  clearAuthState()
  currentRoomState.value = null
  battleHistory.value = []
  myBattleHistory.value = []
  globalBattleHistory.value = []
  emit('back')
}

watch(
  () => currentRoomState.value?.id,
  (id) => {
    if (id == null) {
      battleHistory.value = []
    }
  },
)

watch(
  () => ({
    roomId: currentRoomState.value?.id,
    tok: !!authTokenState.value,
    baseUrl: backendUrlState.value ?? '',
  }),
  () => {
    connectLobbyWs()
  },
  { immediate: true },
)

onMounted(() => {
  load()
  pollTimer = setInterval(refreshRooms, 3000)
})

onBeforeUnmount(() => {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  teardownLobbyWs()
  clearCountdownDisplay()
})
</script>

<template>
  <main class="home">
    <!-- Countdown overlay -->
    <div v-if="countdownSeconds > 0" class="countdown-overlay">
      <div class="countdown-panel">
        <p class="countdown-label">对局即将开始</p>
        <div class="countdown-number">{{ countdownSeconds }}</div>
        <p class="countdown-sub">请做好准备…</p>
      </div>
    </div>

    <section class="panel">
      <p class="badge">联机模式 · 房间</p>
      <h1>房间大厅</h1>
      <p class="subtitle">当前账号：{{ currentUserState?.nickname }}（{{ currentUserState?.username }}）</p>
      <div class="entry-buttons">
        <button type="button" class="secondary" :disabled="loading" @click="logout">退出登录</button>
      </div>

      <div class="difficulty-options">
        <input v-model="roomName" type="text" placeholder="新房间名称" :disabled="loading" />
        <button type="button" :disabled="loading || !roomName.trim()" @click="createRoom">创建房间</button>
      </div>

      <div v-if="currentRoomState" class="room-panel">
        <p class="room-info">
          当前房间：<strong>#{{ currentRoomState.id }} {{ currentRoomState.name }}</strong>
          <span :class="['room-status', currentRoomState.status.toLowerCase()]">{{ currentRoomState.status }}</span>
        </p>

        <!-- Fighter model selector -->
        <div class="model-selector">
          <span class="model-label">选择战机：</span>
          <div class="model-buttons">
            <button
              v-for="model in FIGHTER_TYPE_LIST"
              :key="model"
              type="button"
              :class="['model-btn', { active: selectedModel === model }]"
              :disabled="loading"
              @click="chooseModel(model)"
            >
              <span class="model-name">{{ model }}</span>
              <span class="model-stat">血{{ FIGHTER_TYPES[model].hp }} 速{{ FIGHTER_TYPES[model].maxSpeed }}</span>
            </button>
          </div>
        </div>

        <!-- Room actions -->
        <div class="entry-buttons room-actions">
          <button type="button" :disabled="loading" @click="selectTeam('RED')">选红队</button>
          <button type="button" :disabled="loading" @click="selectTeam('BLUE')">选蓝队</button>
          <button type="button" class="secondary" :disabled="loading" @click="leaveRoom">离开房间</button>
          <button
            v-if="isOwner"
            type="button"
            class="start-btn"
            :disabled="!canStart"
            @click="startRoom"
          >
            开始对局
          </button>
          <span v-else class="waiting-hint">等待房主开始…</span>
        </div>

        <!-- Player list -->
        <div v-if="currentRoomState.players && currentRoomState.players.length" class="player-list">
          <p class="player-list-title">房间成员：</p>
          <ul>
            <li
              v-for="player in currentRoomState.players"
              :key="player.userId"
              :class="['player-item', player.team.toLowerCase()]"
            >
              <span class="player-team-tag">{{ player.team === 'RED' ? '红' : '蓝' }}</span>
              {{ player.nickname }}（{{ player.username }}）
            </li>
          </ul>
        </div>

        <div class="room-history-inline">
          <button type="button" class="secondary bh-open-history" @click="openHistoryDialog('room')">
            查看当前房间对战历史…
          </button>
        </div>
      </div>

      <!-- Room list -->
      <div class="room-list-section">
        <p class="section-title">可加入的房间</p>
        <ul v-if="roomListState && roomListState.length">
          <li v-for="room in roomListState" :key="room.id" class="room-list-item">
            <span class="room-list-info">
              <strong>#{{ room.id }}</strong> {{ room.name }}
              <span :class="['room-status', room.status.toLowerCase()]">{{ room.status }}</span>
              红{{ room.redCount }} / 蓝{{ room.blueCount }}
            </span>
            <div class="room-join-btns">
              <button type="button" :disabled="loading" @click="joinRoom(room, 'RED')">加入红队</button>
              <button type="button" :disabled="loading" @click="joinRoom(room, 'BLUE')">加入蓝队</button>
            </div>
          </li>
        </ul>
        <p v-else class="no-rooms">暂无可用房间，创建一个吧</p>
      </div>

      <!-- 战绩弹窗入口（避免首屏铺满） -->
      <div class="history-entries-panel">
        <p class="section-title">联机对战记录</p>
        <p class="history-cache-line">
          <span v-if="globalBattleHistory.length">全服已加载 {{ globalBattleHistory.length }} 场</span>
          <span v-if="globalBattleHistory.length && myBattleHistory.length"> · </span>
          <span v-if="myBattleHistory.length">个人 {{ myBattleHistory.length }} 场</span>
          <span
            v-if="(globalBattleHistory.length || myBattleHistory.length) && battleHistory.length && currentRoomState"
          >
            ·
          </span>
          <span v-if="battleHistory.length && currentRoomState">本房间 {{ battleHistory.length }} 场</span>
          <span
            v-if="!globalBattleHistory.length && !myBattleHistory.length && !(battleHistory.length && currentRoomState)"
            class="battle-history-hint"
          >
            尚未加载明细；点击下方按钮在弹窗中获取。
          </span>
        </p>
        <p class="battle-history-hint history-entries-hint">点击后在弹窗中查看并可关闭；切换标签可查看全服 / 个人 / 本房间。</p>
        <div class="history-entry-buttons">
          <button type="button" class="secondary" @click="openHistoryDialog('global')">全服最近联机场次…</button>
          <button type="button" class="secondary" @click="openHistoryDialog('my')">个人参战记录…</button>
          <button v-if="currentRoomState" type="button" class="secondary" @click="openHistoryDialog('room')">
            当前房间历史（弹窗）…
          </button>
        </div>
      </div>

      <dialog
        ref="historyDialogEl"
        class="bh-modal"
        @click.self="closeHistoryDialog"
        @cancel.prevent="closeHistoryDialog"
      >
        <div class="bh-modal-card" @click.stop>
          <header class="bh-modal-header">
            <h2 class="bh-modal-title">对战记录</h2>
            <button type="button" class="ghost-button bh-modal-close" @click="closeHistoryDialog">关闭</button>
          </header>
          <div class="bh-modal-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              :class="['bh-tab', { 'bh-tab-active': historyDlgTab === 'global' }]"
              @click="switchHistoryTab('global')"
            >
              全服
            </button>
            <button
              type="button"
              role="tab"
              :class="['bh-tab', { 'bh-tab-active': historyDlgTab === 'my' }]"
              @click="switchHistoryTab('my')"
            >
              个人
            </button>
            <button
              type="button"
              role="tab"
              :disabled="!currentRoomState"
              :class="['bh-tab', { 'bh-tab-active': historyDlgTab === 'room' }]"
              @click="switchHistoryTab('room')"
            >
              本房间
            </button>
          </div>
          <p v-if="historyDlgTab === 'room' && !currentRoomState" class="battle-history-hint">请先加入房间。</p>
          <p v-if="activeHistoryLoading && !activeHistoryRows.length" class="battle-history-hint">正在加载…</p>
          <p v-else-if="!activeHistoryRows.length && !activeHistoryLoading" class="battle-history-hint">
            暂无记录。
          </p>
          <ul v-else class="battle-history-list bh-modal-list">
            <li
              v-for="(row, hi) in activeHistoryRows"
              :key="row.battleRecordId ?? `dlg-${hi}`"
              class="battle-history-row"
            >
              <details class="battle-history-details">
                <summary class="battle-history-summary">
                  <span v-if="historyDlgTab !== 'room'" class="bh-room">房间 #{{ row.roomId }}</span>
                  <span class="bh-ended">{{ formatBattleEndedShort(row.battleEndedAt) }}</span>
                  <span class="bh-winner">胜方 {{ formatWinnerLabel(row.winner) }}</span>
                  <span class="bh-dur">时长 {{ formatDurationMmSs(row.durationSeconds) }}</span>
                  <span v-if="row.redTeamKills != null || row.blueTeamKills != null" class="bh-kills">
                    红击落 {{ row.redTeamKills ?? '—' }} / 蓝击落 {{ row.blueTeamKills ?? '—' }}
                  </span>
                </summary>
                <div class="bh-tables">
                  <div class="bh-side">
                    <p class="bh-side-title red">红方真人</p>
                    <table v-if="redRows(row.players).length" class="bh-table">
                      <thead>
                        <tr>
                          <th>昵称</th>
                          <th>机型</th>
                          <th>击杀</th>
                          <th>伤害</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="p in redRows(row.players)" :key="`dr-${hi}-${p.userId}`">
                          <td>{{ p.nickname }}</td>
                          <td>{{ p.fighterModel }}</td>
                          <td>{{ p.kills }}</td>
                          <td>{{ p.damageDealt }}</td>
                        </tr>
                      </tbody>
                    </table>
                    <p v-else class="bh-empty">无记录</p>
                  </div>
                  <div class="bh-side">
                    <p class="bh-side-title blue">蓝方真人</p>
                    <table v-if="blueRows(row.players).length" class="bh-table">
                      <thead>
                        <tr>
                          <th>昵称</th>
                          <th>机型</th>
                          <th>击杀</th>
                          <th>伤害</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="p in blueRows(row.players)" :key="`db-${hi}-${p.userId}`">
                          <td>{{ p.nickname }}</td>
                          <td>{{ p.fighterModel }}</td>
                          <td>{{ p.kills }}</td>
                          <td>{{ p.damageDealt }}</td>
                        </tr>
                      </tbody>
                    </table>
                    <p v-else class="bh-empty">无记录</p>
                  </div>
                </div>
              </details>
            </li>
          </ul>
        </div>
      </dialog>

      <p v-if="error" class="hud-status">{{ error }}</p>
    </section>
  </main>
</template>

<style scoped>
.countdown-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 8, 20, 0.88);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  pointer-events: all;
}

.countdown-panel {
  text-align: center;
  padding: 48px 72px;
  background: rgba(4, 22, 48, 0.95);
  border: 1px solid rgba(88, 180, 255, 0.4);
  border-radius: 16px;
  box-shadow: 0 0 40px rgba(64, 160, 255, 0.3);
}

.countdown-label {
  color: rgba(130, 210, 255, 0.9);
  font-size: 18px;
  margin-bottom: 12px;
  letter-spacing: 0.08em;
}

.countdown-number {
  font-size: 96px;
  font-weight: 700;
  color: #4fc3f7;
  line-height: 1;
  text-shadow: 0 0 32px rgba(79, 195, 247, 0.7);
  animation: pulse 1s ease-in-out infinite;
}

.countdown-sub {
  color: rgba(100, 180, 255, 0.6);
  font-size: 14px;
  margin-top: 12px;
  letter-spacing: 0.12em;
}

@keyframes pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.08); opacity: 0.85; }
}

.room-panel {
  margin-top: 16px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(88, 160, 220, 0.2);
  border-radius: 8px;
}

.room-info {
  font-size: 14px;
  color: rgba(180, 220, 255, 0.85);
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.room-status {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 12px;
  font-weight: 600;
  letter-spacing: 0.05em;
}
.room-status.waiting { background: rgba(255, 200, 60, 0.2); color: #ffd54f; border: 1px solid rgba(255, 200, 60, 0.3); }
.room-status.running { background: rgba(76, 200, 120, 0.2); color: #69f0ae; border: 1px solid rgba(76, 200, 120, 0.3); }
.room-status.finished { background: rgba(180, 180, 200, 0.15); color: #aaa; border: 1px solid rgba(180, 180, 200, 0.2); }
.room-status.expired { background: rgba(200, 160, 140, 0.15); color: #caa; border: 1px solid rgba(200, 160, 140, 0.25); }

.model-selector {
  margin-bottom: 14px;
}

.model-label {
  font-size: 12px;
  color: rgba(130, 200, 255, 0.7);
  display: block;
  margin-bottom: 8px;
}

.model-buttons {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.model-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 14px;
  background: rgba(30, 60, 100, 0.5);
  border: 1px solid rgba(88, 160, 255, 0.25);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.18s;
  min-width: 72px;
}

.model-btn:hover:not(:disabled) {
  background: rgba(50, 90, 150, 0.6);
  border-color: rgba(88, 180, 255, 0.5);
}

.model-btn.active {
  background: rgba(50, 120, 220, 0.45);
  border-color: rgba(88, 180, 255, 0.8);
  box-shadow: 0 0 12px rgba(88, 180, 255, 0.3);
}

.model-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.model-name {
  font-size: 13px;
  font-weight: 600;
  color: rgba(210, 235, 255, 0.9);
}

.model-stat {
  font-size: 10px;
  color: rgba(140, 190, 255, 0.6);
  margin-top: 2px;
}

.room-actions {
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 14px;
}

.start-btn {
  background: linear-gradient(135deg, rgba(76, 190, 120, 0.5), rgba(50, 150, 200, 0.5));
  border-color: rgba(76, 200, 130, 0.5) !important;
  color: #a0ffcc !important;
  font-weight: 600;
  padding: 8px 20px;
}

.start-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, rgba(76, 190, 120, 0.7), rgba(50, 150, 200, 0.7));
  box-shadow: 0 0 14px rgba(76, 200, 130, 0.35);
}

.start-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.waiting-hint {
  font-size: 12px;
  color: rgba(160, 180, 200, 0.6);
  padding: 8px 0;
  font-style: italic;
}

.player-list { margin-top: 8px; }
.player-list-title { font-size: 12px; color: rgba(130, 180, 255, 0.7); margin-bottom: 6px; }

.player-list ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 4px; }

.player-item {
  font-size: 13px;
  padding: 5px 10px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.player-item.red { background: rgba(255, 80, 80, 0.1); color: rgba(255, 180, 180, 0.9); }
.player-item.blue { background: rgba(80, 120, 255, 0.1); color: rgba(160, 200, 255, 0.9); }

.player-team-tag {
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 4px;
}
.player-item.red .player-team-tag { background: rgba(255, 80, 80, 0.25); }
.player-item.blue .player-team-tag { background: rgba(80, 120, 255, 0.25); }

.room-list-section { margin-top: 20px; }
.section-title { font-size: 13px; color: rgba(130, 180, 255, 0.7); margin-bottom: 10px; }
.no-rooms { font-size: 13px; color: rgba(120, 140, 160, 0.6); font-style: italic; }

.room-list-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(88, 140, 200, 0.15);
  border-radius: 8px;
  margin-bottom: 8px;
  flex-wrap: wrap;
  gap: 8px;
}

.room-list-info { font-size: 13px; color: rgba(180, 210, 255, 0.8); display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.room-join-btns { display: flex; gap: 6px; }

.battle-history-panel {
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid rgba(88, 140, 200, 0.2);
}

.my-battle-panel {
  padding-top: 16px;
}

.my-battle-hint {
  margin-bottom: 10px !important;
  line-height: 1.45;
}

.bh-room {
  flex: 0 0 auto;
  font-weight: 700;
  color: rgba(190, 230, 255, 0.95);
}

.battle-history-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}

.battle-history-title {
  margin: 0 !important;
}

.bh-refresh-btn {
  padding: 6px 12px !important;
  font-size: 13px !important;
}

.battle-history-hint {
  font-size: 12px;
  color: rgba(130, 160, 190, 0.65);
  margin: 0;
}

.battle-history-list {
  list-style: none;
  padding: 0;
  margin: 8px 0 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.battle-history-row {
  margin: 0;
}

.battle-history-details {
  border: 1px solid rgba(88, 140, 200, 0.25);
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.12);
}

.battle-history-summary {
  cursor: pointer;
  padding: 10px 12px;
  font-size: 12px;
  color: rgba(180, 210, 255, 0.88);
  display: flex;
  flex-wrap: wrap;
  gap: 10px 16px;
  align-items: center;
  user-select: none;
  list-style: none;
}

.battle-history-summary::-webkit-details-marker {
  display: none;
}

.bh-ended { color: rgba(130, 200, 255, 0.85); font-weight: 600; }
.bh-winner { color: rgba(220, 200, 120, 0.95); }
.bh-dur { color: rgba(160, 200, 255, 0.75); }
.bh-kills { color: rgba(160, 180, 210, 0.7); font-size: 11px; }

.bh-tables {
  padding: 0 12px 12px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

@media (max-width: 620px) {
  .bh-tables {
    grid-template-columns: 1fr;
  }
}

.bh-side-title {
  margin: 0 0 6px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.bh-side-title.red { color: #ff9494; }
.bh-side-title.blue { color: #8cbcff; }

.bh-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}

.bh-table th,
.bh-table td {
  padding: 4px 6px;
  border-bottom: 1px solid rgba(88, 120, 170, 0.2);
  text-align: left;
}

.bh-table th {
  color: rgba(130, 180, 230, 0.7);
  font-weight: 600;
}

.bh-empty {
  font-size: 11px;
  color: rgba(120, 150, 180, 0.55);
  margin: 0;
}

.room-history-inline {
  margin-top: 12px;
}

.bh-open-history {
  width: 100%;
}

.history-entries-panel {
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid rgba(88, 140, 200, 0.2);
}

.history-cache-line {
  font-size: 12px;
  color: rgba(160, 200, 235, 0.85);
  margin: 0 0 6px;
}

.history-entry-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.history-entries-hint {
  margin-bottom: 8px !important;
}

.bh-modal {
  border: none;
  padding: 0;
  background: transparent;
  max-width: 100vw;
  max-height: 100vh;
  z-index: 10001;
}

.bh-modal::backdrop {
  background: rgba(0, 8, 20, 0.82);
}

.bh-modal-card {
  width: min(720px, 92vw);
  max-height: min(680px, 88vh);
  margin: auto;
  padding: 16px 18px;
  background: rgba(4, 18, 42, 0.98);
  border: 1px solid rgba(88, 180, 255, 0.35);
  border-radius: 14px;
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.55);
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-sizing: border-box;
}

.bh-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.bh-modal-title {
  margin: 0;
  font-size: 18px;
  color: rgba(200, 230, 255, 0.95);
}

.bh-modal-close {
  flex-shrink: 0;
}

.bh-modal-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.bh-tab {
  padding: 6px 14px;
  font-size: 13px;
  border-radius: 8px;
  border: 1px solid rgba(88, 140, 200, 0.35);
  background: rgba(20, 45, 85, 0.45);
  color: rgba(180, 210, 255, 0.85);
  cursor: pointer;
}

.bh-tab:hover:not(:disabled) {
  border-color: rgba(120, 190, 255, 0.55);
}

.bh-tab:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.bh-tab-active {
  background: rgba(50, 110, 190, 0.55);
  border-color: rgba(120, 200, 255, 0.65);
  color: #eaf4ff;
}

.bh-modal-list {
  margin: 0;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
  max-height: min(52vh, 420px);
  padding-right: 4px;
}
</style>
