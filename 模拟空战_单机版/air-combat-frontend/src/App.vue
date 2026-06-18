<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import HomeView from './views/HomeView.vue'
import GameView from './views/GameView.vue'
import OnlineGameView from './views/OnlineGameView.vue'
import LoginView from './views/LoginView.vue'
import RoomView from './views/RoomView.vue'
import type { AIDifficulty, FighterType } from './game/types'
import { authTokenState, backendUrlState } from './stores/authStore'
import { setAuthInvalidRedirect } from './api/sessionGuard'
import { sendLogoutBeacon } from './api/authApi'

const mode = ref<'HOME' | 'LOCAL' | 'LOGIN' | 'ROOM' | 'ONLINE'>('HOME')
const difficulty = ref<AIDifficulty>('NORMAL')
const fighterType = ref<FighterType>('J-20')
const onlineConfig = ref<{ backendUrl: string; token: string; roomId: number } | null>(null)

const onWindowBeforeUnload = (): void => {
  sendLogoutBeacon(backendUrlState.value, authTokenState.value)
}

onMounted(() => {
  setAuthInvalidRedirect(() => {
    onlineConfig.value = null
    mode.value = 'LOGIN'
  })
  window.addEventListener('beforeunload', onWindowBeforeUnload)
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', onWindowBeforeUnload)
})

const startLocalMode = (payload: { difficulty: AIDifficulty; fighterType: FighterType }): void => {
  difficulty.value = payload.difficulty
  fighterType.value = payload.fighterType
  mode.value = 'LOCAL'
}

const startOnlineMode = (value: { backendUrl: string; token: string; roomId: number }): void => {
  onlineConfig.value = value
  mode.value = 'ONLINE'
}

const openOnlineFlow = (): void => {
  mode.value = authTokenState.value ? 'ROOM' : 'LOGIN'
}
</script>

<template>
  <HomeView v-if="mode === 'HOME'" @start-local="startLocalMode" @open-online="openOnlineFlow" />
  <GameView
    v-else-if="mode === 'LOCAL'"
    :difficulty="difficulty"
    :fighter-type="fighterType"
    @exit="mode = 'HOME'"
  />
  <LoginView v-else-if="mode === 'LOGIN'" @back="mode = 'HOME'" @login-success="mode = 'ROOM'" />
  <RoomView
    v-else-if="mode === 'ROOM'"
    @back="mode = 'HOME'"
    @enter-online="startOnlineMode"
  />
  <OnlineGameView
    v-else-if="onlineConfig"
    :backend-url="onlineConfig.backendUrl"
    :token="onlineConfig.token"
    :room-id="onlineConfig.roomId"
    @exit="mode = 'ROOM'"
  />
</template>
