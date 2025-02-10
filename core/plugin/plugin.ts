export interface Plugin<T> {
  apply(target: T): void
}
