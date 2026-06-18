export interface Poolable {
  reset(): void
}

export class ObjectPool<T extends Poolable> {
  private readonly items: T[] = []
  private readonly factory: () => T
  private readonly maxRetained: number

  constructor(
    factory: () => T,
    initialSize = 0,
    maxRetained = 256,
  ) {
    this.factory = factory
    this.maxRetained = Math.max(initialSize, maxRetained)
    for (let i = 0; i < initialSize; i += 1) {
      this.items.push(this.factory())
    }
  }

  acquire(): T {
    return this.items.pop() ?? this.factory()
  }

  release(item: T): void {
    item.reset()
    if (this.items.length >= this.maxRetained) {
      return
    }
    this.items.push(item)
  }

  getSize(): number {
    return this.items.length
  }
}
