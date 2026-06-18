<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { BattleSnapshot } from '../game/types'
import { GameRenderer } from '../rendering/GameRenderer'
import { FpsCounter, MIN_RENDER_INTERVAL_MS } from '../rendering/fpsCounter'
import { viewportSize } from '../shared/battlefieldConfig'

const props = withDefaults(
  defineProps<{
    snapshot: BattleSnapshot
    fps: number
    playerId: string
    /** 联机：常驻 rAF 按显示刷新重绘，>120Hz 屏限 120 次/秒；单机：随快照 watch 重绘（与 LocalGame rAF 对齐） */
    continuousRafRender?: boolean
  }>(),
  { continuousRafRender: false },
)

const emit = defineEmits<{
  canvasReady: [canvas: HTMLCanvasElement]
  renderFps: [fps: number]
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
let renderer: GameRenderer | null = null
const renderFpsMeter = new FpsCounter()
let rafLoopId = 0
let lastThrottleRenderMs = 0

const renderSnapshot = (timestampMs: number): void => {
  if (!renderer) {
    return
  }
  const fpsDisplay = renderFpsMeter.update(timestampMs)
  renderer.render(props.snapshot, {
    fps: fpsDisplay,
    playerId: props.playerId,
  })
  emit('renderFps', fpsDisplay)
}

const rafLoop = (ts: number): void => {
  if (!renderer) {
    rafLoopId = window.requestAnimationFrame(rafLoop)
    return
  }
  if (lastThrottleRenderMs === 0 || ts - lastThrottleRenderMs >= MIN_RENDER_INTERVAL_MS - 0.4) {
    lastThrottleRenderMs = ts
    renderSnapshot(ts)
  }
  rafLoopId = window.requestAnimationFrame(rafLoop)
}

onMounted(() => {
  const canvas = canvasRef.value
  if (!canvas) {
    return
  }
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return
  }

  renderer = new GameRenderer(ctx, viewportSize.width, viewportSize.height)
  emit('canvasReady', canvas)

  if (props.continuousRafRender) {
    lastThrottleRenderMs = 0
    rafLoopId = window.requestAnimationFrame(rafLoop)
  } else {
    renderSnapshot(performance.now())
  }
})

watch(
  () => [props.snapshot, props.playerId],
  () => {
    if (!props.continuousRafRender) {
      renderSnapshot(performance.now())
    }
  },
  { flush: 'post' },
)

onBeforeUnmount(() => {
  if (rafLoopId) {
    window.cancelAnimationFrame(rafLoopId)
    rafLoopId = 0
  }
  renderFpsMeter.reset()
  renderer = null
})
</script>

<template>
  <div class="battle-canvas-shell">
    <canvas
      ref="canvasRef"
      class="battle-canvas"
      :width="viewportSize.width"
      :height="viewportSize.height"
    />
  </div>
</template>
