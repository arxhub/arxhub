export type InterpolatedPart = { kind: 'text'; text: string } | { kind: 'slot'; name: string }

// Split on `{name}`: a translated sentence decides where its code sample or emphasised word goes, and the
// template only supplies what fills each place.
export function interpolatedParts(text: string): InterpolatedPart[] {
  const parts: InterpolatedPart[] = []
  const pieces = text.split(/\{(\w+)\}/)
  pieces.forEach((piece, index) => {
    if (index % 2 === 1) parts.push({ kind: 'slot', name: piece })
    else if (piece !== '') parts.push({ kind: 'text', text: piece })
  })
  return parts
}
