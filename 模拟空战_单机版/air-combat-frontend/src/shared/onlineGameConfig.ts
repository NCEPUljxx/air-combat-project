/** 与后端 `application.yml` 中 `air-combat.game.tick-rate` 对齐的输入采样周期（毫秒） */
export const ONLINE_TICK_RATE = 120
export const ONLINE_INPUT_PUMP_MS = Math.round(1000 / ONLINE_TICK_RATE)
