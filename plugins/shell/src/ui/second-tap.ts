import { isObjectType, type TabType } from './tab-type'

// What a second tap on the active type opens, in the order a type's own declaration wins over the shell's
// defaults. Null — the tap does nothing: a sheet that holds nothing is worse than a key that stays put.
export type SecondTap = 'content' | 'tabs' | 'nav'

export function secondTapOf(type: TabType): SecondTap | null {
  if (type.sheet?.content != null) return 'content'
  // Tabs only for a type that declared the "what is open" role: a queue of forty tracks is not forty tabs,
  // and a type that counts something else has to say what its sheet shows.
  if (isObjectType(type) && type.open != null) return 'tabs'
  if (type.nav != null) return 'nav'
  return null
}
