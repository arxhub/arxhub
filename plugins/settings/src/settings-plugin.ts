import { Plugin, type PluginArgs, type PluginContext } from '@arxhub/core'
import { ShellExtension } from '@arxhub/plugin-shell'
import { h, markRaw } from 'vue'
import { SETTINGS_TYPE_ID } from './contributions'
import { t } from './i18n/messages'
import { LANGUAGE_SECTION_ID } from './language-section'
import { manifest } from './manifest'
import { settingsBar } from './settings-bar'
import { SettingsExtension } from './settings-extension'
import LanguageSettingsPage from './ui/LanguageSettingsPage.vue'
import PendingChangesStatus from './ui/PendingChangesStatus.vue'
import SettingsLayout from './ui/SettingsLayout.vue'
import SettingsNav from './ui/SettingsNav.vue'
import SettingsSectionList from './ui/SettingsSectionList.vue'

export class SettingsPlugin extends Plugin {
  constructor(args: PluginArgs) {
    super(args, manifest)
  }

  override create(ctx: PluginContext): void {
    super.create(ctx)
    ctx.extensions.register(SettingsExtension)
  }

  override configure(ctx: PluginContext): void {
    super.configure(ctx)

    const shell = ctx.extensions.get(ShellExtension)
    const settings = ctx.extensions.get(SettingsExtension)
    // A type with no objects: a section is chosen from a list, not opened, closed, split and dragged —
    // which is what a tab means (F-23). Unpinned (OR-05): a permanent key in the phone's bottom row is
    // the most reachable place the frame has, and settings are not where the owner works — it is
    // reached from the "Open or switch to" sheet and stands in the row only while it is open. The same
    // in both frames, because `pinned` describes the type and not a frame, and a per-frame pin would
    // make every plugin answer that question twice.
    shell.types.register({
      id: SETTINGS_TYPE_ID,
      icon: 'lu:settings',
      title: () => t('type.title'),
      order: 1000,
      pinned: false,
      content: markRaw(SettingsLayout),
      nav: { component: markRaw(SettingsNav), title: () => t('type.sections') },
      summary: () => t('type.summary'),
      bar: () => settingsBar(settings),
      sheet: { title: () => t('type.sections'), content: markRaw({ render: () => h(SettingsSectionList, { marked: true }) }) },
    })
    // Here rather than in a plugin of its own: settings is essential, so a maintenance boot — the one an owner
    // who picked a language they cannot read ends up in — can still switch it back. Beside Appearance (5).
    settings.register({
      id: LANGUAGE_SECTION_ID,
      title: () => t('language.title'),
      icon: 'lu:languages',
      order: 6,
      component: markRaw(LanguageSettingsPage),
    })
    // Staged settings edits are app-wide, so the status bar reports them even when Settings is closed.
    // It reports and leads back; applying them is SettingsChangesBar's job, so this is a state.
    shell.status.register({ id: 'arxhub.settings.pending', kind: 'status', component: markRaw(PendingChangesStatus) })
  }
}
