export * from './component'

export function navigate(url: string): void {
  window.dispatchEvent(
    new CustomEvent('arx-navigate', {
      detail: { url },
    }),
  )
}
