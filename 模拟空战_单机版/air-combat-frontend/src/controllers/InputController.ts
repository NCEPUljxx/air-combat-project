import type { InputCommand } from '../game/types'

export class InputController {
  private readonly pressed = new Set<string>()
  private fireMissileRequested = false
  private fireBombRequested = false
  private missileIntentFromMouse = false
  private bombIntentFromMouse = false
  private canvas: HTMLCanvasElement | null = null
  /** Pixel offset from canvas top-left (matches world ray with viewport). */
  private mouseCanvasX = 0
  private mouseCanvasY = 0

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const key = event.key.toLowerCase()
    if (key === 'j' || key === ' ') {
      event.preventDefault()
      if (!event.repeat) {
        this.fireMissileRequested = true
        this.missileIntentFromMouse = false
      }
      return
    }
    if (key === 'k') {
      event.preventDefault()
      if (!event.repeat) {
        this.fireBombRequested = true
        this.bombIntentFromMouse = false
      }
      return
    }
    this.pressed.add(key)
  }

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.pressed.delete(event.key.toLowerCase())
  }

  /** CSS/layout → canvas backing-store pixels (internal width/height match GameRenderer). */
  private syncMouseFromEvent(event: MouseEvent): void {
    if (!this.canvas) {
      return
    }
    const rect = this.canvas.getBoundingClientRect()
    const rw = rect.width
    const rh = rect.height
    const cx = event.clientX - rect.left
    const cy = event.clientY - rect.top
    if (rw <= 0 || rh <= 0) {
      this.mouseCanvasX = 0
      this.mouseCanvasY = 0
      return
    }
    this.mouseCanvasX = (cx * this.canvas.width) / rw
    this.mouseCanvasY = (cy * this.canvas.height) / rh
  }

  private readonly onMouseMove = (event: MouseEvent): void => {
    this.syncMouseFromEvent(event)
  }

  private readonly onMouseDown = (event: MouseEvent): void => {
    if (!this.canvas) {
      return
    }
    this.syncMouseFromEvent(event)

    if (event.button === 0) {
      this.fireMissileRequested = true
      this.missileIntentFromMouse = true
    }
    if (event.button === 2) {
      event.preventDefault()
      this.fireBombRequested = true
      this.bombIntentFromMouse = true
    }
  }

  private readonly onContextMenu = (event: MouseEvent): void => {
    event.preventDefault()
  }

  attach(canvas: HTMLCanvasElement): void {
    this.detach()
    this.canvas = canvas
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    canvas.addEventListener('mousemove', this.onMouseMove)
    canvas.addEventListener('mousedown', this.onMouseDown)
    canvas.addEventListener('contextmenu', this.onContextMenu)
  }

  detach(): void {
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    if (this.canvas) {
      this.canvas.removeEventListener('mousemove', this.onMouseMove)
      this.canvas.removeEventListener('mousedown', this.onMouseDown)
      this.canvas.removeEventListener('contextmenu', this.onContextMenu)
    }
    this.canvas = null
    this.mouseCanvasX = 0
    this.mouseCanvasY = 0
  }

  getMouseCanvasLocal(): { x: number; y: number } {
    return { x: this.mouseCanvasX, y: this.mouseCanvasY }
  }

  consume(): InputCommand {
    const missileFireFromMouse = this.fireMissileRequested ? this.missileIntentFromMouse : undefined
    const bombFireFromMouse = this.fireBombRequested ? this.bombIntentFromMouse : undefined

    const command: InputCommand = {
      moveX: this.resolveAxis(['a', 'arrowleft'], ['d', 'arrowright']),
      moveY: this.resolveAxis(['w', 'arrowup'], ['s', 'arrowdown']),
      fire: this.fireMissileRequested,
      fireBomb: this.fireBombRequested,
      missileFireFromMouse,
      bombFireFromMouse,
    }

    this.fireMissileRequested = false
    this.fireBombRequested = false
    this.missileIntentFromMouse = false
    this.bombIntentFromMouse = false
    return command
  }

  private resolveAxis(negativeKeys: string[], positiveKeys: string[]): -1 | 0 | 1 {
    const negative = negativeKeys.some((key) => this.pressed.has(key))
    const positive = positiveKeys.some((key) => this.pressed.has(key))
    if (negative === positive) {
      return 0
    }
    return negative ? -1 : 1
  }
}
