<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { BattleSnapshot, GameDifficulty, FighterType } from '../game/types'
import BattleCanvas from '../components/BattleCanvas.vue'
import GameHud from '../components/GameHud.vue'
import { LocalGameController } from '../controllers/LocalGameController'

const props = defineProps<{
  difficulty: GameDifficulty
  fighterType: FighterType
}>()

const emit = defineEmits<{
  exit: []
}>()

const controller = new LocalGameController(props.difficulty, props.fighterType)

const snapshot = ref<BattleSnapshot>(controller.getSnapshot())
const renderFps = ref(0)
const playerId = controller.getPlayerId()

const onRenderFps = (value: number): void => {
  renderFps.value = value
}
const isBattleEnded = computed(() => snapshot.value.status !== 'RUNNING')

const formatBattleClock = (ms: number): string => {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

const resultTitle = computed(() => {
  if (snapshot.value.status === 'RED_WIN') return '任务成功'
  if (snapshot.value.status === 'BLUE_WIN') return '任务失败'
  return '战斗结束'
})

let disposeFrameListener: (() => void) | undefined

const onCanvasReady = (canvas: HTMLCanvasElement): void => {
  controller.bindCanvas(canvas)
}

const onExit = (): void => {
  controller.stop()
  emit('exit')
}

const onRestart = (): void => {
  controller.restart()
}

onMounted(() => {
  disposeFrameListener = controller.onFrame((state) => {
    snapshot.value = state.snapshot
  })
  controller.start()
})

onBeforeUnmount(() => {
  disposeFrameListener?.()
  controller.stop()
})
</script>

<template>
  <main class="game-view">
    <header class="game-topbar">
      <div>
        <h1>模拟空战 · 单机模式</h1>
        <p>{{ props.fighterType }} / 大地图 / 雷达支援</p>
      </div>
      <button type="button" class="ghost-button" @click="onExit">返回首页</button>
    </header>

    <section class="game-layout">
      <BattleCanvas
        :snapshot="snapshot"
        :fps="renderFps"
        :player-id="playerId"
        @canvas-ready="onCanvasReady"
        @render-fps="onRenderFps"
      />
      <GameHud
        :snapshot="snapshot"
        :fps="renderFps"
        :player-id="playerId"
        :difficulty="props.difficulty"
      />
    </section>

    <div v-if="isBattleEnded" class="result-modal">
      <div class="result-panel">
        <h2>{{ resultTitle }}</h2>
        <p>本场用时：<strong>{{ formatBattleClock(snapshot.battleElapsedMs) }}</strong></p>
        <p>红方剩余 {{ snapshot.redAlive }} 架，蓝方剩余 {{ snapshot.blueAlive }} 架</p>
        <div class="result-actions">
          <button type="button" @click="onRestart">重新开始</button>
          <button type="button" class="secondary" @click="onExit">退出到首页</button>
        </div>
      </div>
    </div>
  </main>
</template>
