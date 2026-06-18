<script setup lang="ts">
import { ref } from 'vue'
import { FIGHTER_TYPE_LIST, FIGHTER_TYPES } from '../shared/battlefieldConfig'
import type { AIDifficulty, FighterType } from '../game/types'

const emit = defineEmits<{
  startLocal: [payload: { difficulty: AIDifficulty; fighterType: FighterType }]
  openOnline: []
}>()

const selectedDifficulty = ref<AIDifficulty>('NORMAL')
const selectedFighterType = ref<FighterType>('J-20')

const enemyCountMap: Record<AIDifficulty, number> = {
  EASY: 4,
  NORMAL: 8,
  HARD: 12,
}
</script>

<template>
  <main class="home">
    <section class="panel">
      <p class="badge">模拟空战</p>
      <h1>海空域拦截任务</h1>
      <p class="subtitle">
        驾驶红方战机，在空警-500 雷达支援下拦截从边界入侵的蓝方机群。
        大地图、有限视野，雷达小地图提供战场感知。
      </p>

      <div class="entry-buttons">
        <button type="button" @click="emit('startLocal', { difficulty: selectedDifficulty, fighterType: selectedFighterType })">
          进入单机模式
        </button>
        <button type="button" class="secondary" @click="emit('openOnline')">进入联机模式</button>
      </div>

      <div class="difficulty-picker">
        <p>机型选择</p>
        <div class="difficulty-options">
          <button
            v-for="type in FIGHTER_TYPE_LIST"
            :key="type"
            type="button"
            class="difficulty-btn"
            :class="{ active: selectedFighterType === type }"
            @click="selectedFighterType = type"
          >
            {{ FIGHTER_TYPES[type].label }}
          </button>
        </div>
      </div>

      <div v-if="selectedFighterType" class="type-detail">
        <p>
          速度 {{ FIGHTER_TYPES[selectedFighterType].maxSpeed }}
          &nbsp;·&nbsp;血量 {{ FIGHTER_TYPES[selectedFighterType].hp }}
          &nbsp;·&nbsp;导弹伤害 {{ FIGHTER_TYPES[selectedFighterType].missileDamage }}
          &nbsp;·&nbsp;炸弹伤害 {{ FIGHTER_TYPES[selectedFighterType].bombDamage }}
        </p>
      </div>

      <div class="difficulty-picker">
        <p>难度选择</p>
        <div class="difficulty-options">
          <button
            type="button"
            class="difficulty-btn"
            :class="{ active: selectedDifficulty === 'EASY' }"
            @click="selectedDifficulty = 'EASY'"
          >
            简单（{{ enemyCountMap.EASY }} 架）
          </button>
          <button
            type="button"
            class="difficulty-btn"
            :class="{ active: selectedDifficulty === 'NORMAL' }"
            @click="selectedDifficulty = 'NORMAL'"
          >
            普通（{{ enemyCountMap.NORMAL }} 架）
          </button>
          <button
            type="button"
            class="difficulty-btn"
            :class="{ active: selectedDifficulty === 'HARD' }"
            @click="selectedDifficulty = 'HARD'"
          >
            困难（{{ enemyCountMap.HARD }} 架）
          </button>
        </div>
      </div>

      <ul>
        <li>大地图视野（3600×2160），相机跟随玩家</li>
        <li>雷达小地图实时显示 AWACS 探测区域内的敌机与友机</li>
        <li>导弹在雷达覆盖内持续追踪；覆盖外仅追踪 1 秒</li>
        <li>炸弹沿发射方向飞行，3 秒后或碰敌引爆，面积伤害</li>
        <li>AWACS 血量下降时雷达探测范围同步缩小</li>
      </ul>
    </section>
  </main>
</template>

<style scoped>
.type-detail {
  margin: -8px 0 14px;
  color: var(--muted);
  font-size: 13px;
}
</style>
