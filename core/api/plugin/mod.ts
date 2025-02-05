export interface Plugin<T> {
  apply(target: T): Promise<void>
}
