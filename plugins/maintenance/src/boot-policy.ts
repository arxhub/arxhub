export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export const BOOT_POLICY_KEY = 'arxhub.boot'

interface BootPolicyState {
  disabled: string[]
  maintenance: boolean
}

const EMPTY: BootPolicyState = { disabled: [], maintenance: false }

function parse(raw: string | null): BootPolicyState {
  if (raw == null) return EMPTY
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed == null || typeof parsed !== 'object') return EMPTY
    const { disabled, maintenance } = parsed as Partial<BootPolicyState>
    return {
      // Renaming the editor must not re-enable a plugin the owner disabled to recover a boot.
      disabled: Array.isArray(disabled)
        ? [...new Set(disabled.filter((it) => typeof it === 'string').map((it) => (it === 'Editor' ? 'ArxEditor' : it)))]
        : [],
      maintenance: maintenance === true,
    }
  } catch {
    // A hand-edited or half-written entry must not be the thing that stops the app from booting —
    // that is the opposite of what this file is for. Fall back to booting everything.
    return EMPTY
  }
}

// Which plugins this device must not boot, and whether to boot the essential set only.
//
// Deliberately localStorage and NOT a config file: config lives in the VFS behind the vfs, config and
// protection plugins — the very ones that may be failing. A recovery switch that needs the thing it
// recovers is not a recovery switch. It is also per-device on purpose: a plugin that only breaks on
// one machine (an unreachable host, a missing native module) should not go dark for every device
// through sync.
export class BootPolicy {
  private readonly storage: StorageLike
  private state: BootPolicyState

  constructor(storage: StorageLike = localStorage) {
    this.storage = storage
    this.state = parse(storage.getItem(BOOT_POLICY_KEY))
  }

  // Manifest names of plugins to skip on the next boot. Essential plugins ignore this — core keeps
  // booting them whatever ends up in here.
  get disabled(): readonly string[] {
    return this.state.disabled
  }

  get maintenance(): boolean {
    return this.state.maintenance
  }

  isDisabled(name: string): boolean {
    return this.state.disabled.includes(name)
  }

  setEnabled(name: string, enabled: boolean): void {
    if (enabled === !this.isDisabled(name)) return
    const disabled = enabled ? this.state.disabled.filter((it) => it !== name) : [...this.state.disabled, name]
    this.write({ ...this.state, disabled })
  }

  setMaintenance(maintenance: boolean): void {
    this.write({ ...this.state, maintenance })
  }

  // Back to booting everything — the escape hatch when the stored policy is what's wrong.
  clear(): void {
    this.state = EMPTY
    this.storage.removeItem(BOOT_POLICY_KEY)
  }

  private write(state: BootPolicyState): void {
    this.state = state
    this.storage.setItem(BOOT_POLICY_KEY, JSON.stringify(state))
  }
}
