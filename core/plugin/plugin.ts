export interface Plugin<T> {
  readonly name: string

  apply(target: T): void

  start?(target: T): Promise<void>
  stop?(target: T): Promise<void>
}
