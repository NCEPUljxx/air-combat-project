/** 显示层硬上限：高于此的显示器上通过 BattleCanvas rAF 节流（不产生「超过 120」的显示帧率数字） */
export const MAX_DISPLAY_FPS = 120

/** 两次实际 `render` 之间的最小间隔（毫秒），用于 >120Hz 屏限频 */
export const MIN_RENDER_INTERVAL_MS = 1000 / MAX_DISPLAY_FPS

/**
 * 仅在每次真实画布战斗层 `render()` 完成后调用。
 * 由相邻两次 render 的时间间隔估计 FPS，平滑后且不超过 MAX_DISPLAY_FPS。
 */
export class FpsCounter {
  private lastFrameMs = 0
  private emaFps = 0

  update(timestampMs: number): number {
    if (this.lastFrameMs > 0) {
      const dt = timestampMs - this.lastFrameMs
      if (dt > 0) {
        const inst = Math.min(MAX_DISPLAY_FPS, 1000 / dt)
        this.emaFps = this.emaFps === 0 ? inst : this.emaFps * 0.88 + inst * 0.12
      }
    }
    this.lastFrameMs = timestampMs
    return Math.round(Math.min(MAX_DISPLAY_FPS, this.emaFps))
  }

  reset(): void {
    this.lastFrameMs = 0
    this.emaFps = 0
  }
}
