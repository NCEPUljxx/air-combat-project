<script setup lang="ts">
import { computed } from 'vue'
import type { BattleSnapshot, GameDifficulty } from '../game/types'
import { FIGHTER_TYPE_LIST, FIGHTER_TYPES } from '../shared/battlefieldConfig'
import {
  FIGHTER_LEGEND_VIEWBOX,
  FIGHTER_LEGEND_NEUTRAL,
  hudLegendFragmentsForModel,
} from '../rendering/fighterShapes'

const props = defineProps<{
  snapshot: BattleSnapshot
  fps: number
  playerId: string
  difficulty: GameDifficulty
}>()

const fighterLegendRows = computed(() =>
  FIGHTER_TYPE_LIST.map((model) => {
    const cfg = FIGHTER_TYPES[model]
    return {
      model,
      fragments: hudLegendFragmentsForModel(model),
      stroke: FIGHTER_LEGEND_NEUTRAL.stroke,
      fill: FIGHTER_LEGEND_NEUTRAL.fill,
      line: `${cfg.label.replace(/\s+/, ' ')}　速${cfg.maxSpeed}　血${cfg.hp}　弹${cfg.missileCount}/${cfg.bombCount}`,
    }
  }),
)

const player = computed(() =>
  props.snapshot.fighters.find((fighter) => fighter.id === props.playerId),
)

const missileText = computed(() => {
  if (!player.value) return '0'
  if (player.value.infiniteMissiles) return '∞'
  return String(player.value.missileCount)
})

const bombText = computed(() => player.value ? String(player.value.bombCount) : '0')

const radarRangeText = computed(() => `${Math.round(props.snapshot.awacsRadarRange ?? 0)}`)

const statusText = computed(() => {
  if (props.snapshot.status === 'RED_WIN') return '红方胜利：敌机群已清空'
  if (props.snapshot.status === 'BLUE_WIN') return '蓝方胜利：红方主机被击落'
  if (props.snapshot.status === 'DRAW') return '平局：双方战斗机构同时清空'
  if (props.snapshot.status === 'FAILED') return '平局：战场任务失败'
  return '交战中'
})

const difficultyTextMap: Record<GameDifficulty, string> = {
  EASY: '简单（4 架）',
  NORMAL: '普通（8 架）',
  HARD: '困难（12 架）',
}

const formatBattleClock = (ms: number): string => {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

const hudMemoKey = computed(() => {
  const p = props.snapshot.fighters.find((f) => f.id === props.playerId)
  return [
    props.snapshot.tick,
    props.snapshot.status,
    props.snapshot.redAlive,
    props.snapshot.blueAlive,
    props.snapshot.battleElapsedMs,
    props.snapshot.awacsRadarRange,
    props.fps,
    props.playerId,
    props.difficulty,
    p?.hp,
    p?.speed,
    p?.missileCount,
    p?.bombCount,
    p?.infiniteMissiles,
    p?.model,
  ]
})
</script>

<template>
  <aside class="hud" v-memo="hudMemoKey">
    <h2>战术信息</h2>
    <p class="hud-status">{{ statusText }}</p>
    <p>渲染 FPS：<strong>{{ fps }}</strong>（画布实际重绘）</p>
    <p>本场用时：<strong>{{ formatBattleClock(snapshot.battleElapsedMs) }}</strong></p>
    <p>红方存活：<strong>{{ snapshot.redAlive }}</strong></p>
    <p>蓝方存活：<strong>{{ snapshot.blueAlive }}</strong></p>
    <p>难度：<strong>{{ difficultyTextMap[difficulty] }}</strong></p>
    <p>机型：<strong>{{ player?.model ?? '—' }}</strong></p>
    <p>速度：<strong>{{ player ? Math.round(player.speed) : 0 }}</strong></p>
    <p>血量：<strong>{{ player ? player.hp : 0 }}</strong></p>
    <p>导弹：<strong>{{ missileText }}</strong></p>
    <p>炸弹：<strong>{{ bombText }}</strong></p>
    <p>雷达范围：<strong>{{ radarRangeText }}</strong></p>
    <div class="control-tip">
      <p>W / A / S / D 或方向键：移动</p>
      <p>鼠标瞄准位置：发射方向</p>
      <p>J / 空格 / 鼠标左键：导弹</p>
      <p>K / 鼠标右键：炸弹</p>
    </div>
    <div class="fighter-legend-hud">
      <p class="fighter-legend-title">── 战机图例 ──</p>
      <ul class="fighter-legend-list">
        <li v-for="row in fighterLegendRows" :key="row.model" class="fighter-legend-row">
          <svg
            class="fighter-shape-icon"
            :viewBox="FIGHTER_LEGEND_VIEWBOX"
            aria-hidden="true"
          >
            <template v-for="(frag, fi) in row.fragments" :key="fi">
              <path
                v-if="frag.kind === 'path'"
                :d="frag.d"
                :fill="row.fill"
                :stroke="row.stroke"
                stroke-width="1.2"
                stroke-linejoin="round"
                :fill-opacity="frag.fillOpacity ?? 1"
              />
              <line
                v-else-if="frag.kind === 'line'"
                :x1="frag.x1"
                :y1="frag.y1"
                :x2="frag.x2"
                :y2="frag.y2"
                :stroke="row.stroke"
                :stroke-width="frag.strokeWidth ?? 0.8"
                :opacity="frag.opacity ?? 1"
              />
              <rect
                v-else-if="frag.kind === 'rect'"
                :x="frag.x"
                :y="frag.y"
                :width="frag.width"
                :height="frag.height"
                :fill="row.fill"
                :stroke="row.stroke"
                stroke-width="0.6"
              />
            </template>
          </svg>
          <span class="fighter-legend-label">{{ row.model }}</span>
          <span class="fighter-legend-stats">{{ row.line }}</span>
        </li>
      </ul>
    </div>
  </aside>
</template>
