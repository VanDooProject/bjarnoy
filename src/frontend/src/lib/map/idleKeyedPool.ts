/**
 * Keyed pool of display objects with idle expiry: `acquire` hands out the same object for the same key, `sweep` (once per
 * frame, after the frame's acquires) hides the ones not acquired this frame and destroys the ones unused for more than
 * `idleFrames` frames. `nextFrame` starts a frame.
 */
export class IdleKeyedPool<T> {
  private entries = new Map<string, { item: T; lastUsedFrame: number }>();
  private frame = 0;

  private readonly idleFrames: number;

  constructor(idleFrames: number) {
    this.idleFrames = idleFrames;
  }

  nextFrame() {
    this.frame++;
  }

  acquire(key: string, create: () => T): T {
    let entry = this.entries.get(key);
    if (!entry) {
      entry = { item: create(), lastUsedFrame: this.frame };
      this.entries.set(key, entry);
    }
    entry.lastUsedFrame = this.frame;
    return entry.item;
  }

  sweep(hide: (item: T) => void, destroy: (item: T) => void) {
    for (const [key, entry] of this.entries) {
      if (entry.lastUsedFrame === this.frame) continue;
      hide(entry.item);
      if (this.frame - entry.lastUsedFrame > this.idleFrames) {
        destroy(entry.item);
        this.entries.delete(key);
      }
    }
  }

  /** Every pooled item, used this frame or not. */
  forEach(fn: (item: T) => void) {
    for (const entry of this.entries.values()) fn(entry.item);
  }

  get size(): number {
    return this.entries.size;
  }
}
