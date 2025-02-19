export interface Plugin<T> {
  apply(target: T): void

  start?(target: T): Promise<void>
  stop?(target: T): Promise<void>
}
