export interface ZoomScale {
  min: number
  max: number
  step?: number
  steps?: readonly number[]
}

// A listed scale wins over an even step: a diff's 75/90/100/125/150 is not arithmetic, and a PDF's
// quarters are. Either way the answer never leaves [min, max].
export function stepZoomValue(current: number, direction: 1 | -1, scale: ZoomScale): number {
  const clamp = (value: number) => Math.min(scale.max, Math.max(scale.min, value))
  const steps = scale.steps?.filter((value) => value >= scale.min && value <= scale.max)
  if (steps && steps.length > 0) {
    // A value off the list (a pinch, an old stored zoom) first snaps to the nearest listed one, so the
    // next click lands on the list rather than one list-step away from an arbitrary value.
    let nearest = 0
    for (let i = 1; i < steps.length; i++) {
      if (Math.abs(steps[i] - current) < Math.abs(steps[nearest] - current)) nearest = i
    }
    const next = Math.min(steps.length - 1, Math.max(0, nearest + direction))
    return steps[next]
  }
  const step = scale.step ?? 0.25
  // Rounded to the step's own precision so repeated clicks land on 0.5, 0.75, 1 … rather than drifting
  // off it from floating-point addition (0.1 + 0.2 territory).
  const stepped = Math.round((current + direction * step) / step) * step
  return clamp(Math.round(stepped * 100) / 100)
}
