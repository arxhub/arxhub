import type { Translation } from '@arxhub/i18n'
import type { en } from './en'

export const ru: Translation<typeof en> = {
  settings: { title: 'Синхронизация' },
  config: {
    serverUrl: { title: 'Адрес сервера', description: 'Адрес сервера ArxHub, например https://hub.example.com' },
    autoSyncSeconds: { title: 'Автосинхронизация (секунды)', description: '0 — синхронизировать только вручную' },
  },
  status: {
    syncing: 'Синхронизация…',
    failed: 'Ошибка синхронизации',
    synced: 'Синхронизировано {when}',
    never: 'Не синхронизировано',
  },
  actions: {
    syncNow: 'Синхронизировать',
    sync: 'Синхронизировать',
    settings: 'Настройки синхронизации',
  },
  conflicts: {
    resolved: {
      one: 'Разрешён {count} конфликт синхронизации',
      few: 'Разрешено {count} конфликта синхронизации',
      many: 'Разрешено {count} конфликтов синхронизации',
    },
    keptOne: 'Ваша версия сохранена; правка с другого устройства — в «{path}».',
    keptMany: 'Ваши версии сохранены; правки с другого устройства — в: {paths}.',
    unresolved: {
      one: '{count} конфликт в «{path}»',
      few: '{count} конфликта в «{path}»',
      many: '{count} конфликтов в «{path}»',
    },
    openToResolve: 'Откройте файл, чтобы разрешить.',
    editOverDelete: 'Правка сохранена вместо удаления: {path}',
  },
  download: {
    step: 'Шаг 4 из 4',
    here: 'Хранилище на месте',
    downloading: 'Загружаем хранилище',
    documents: 'Документы',
    downloaded: 'Загружено',
    cloud: 'Останется в облаке до открытия',
    of: '{done} из {total}',
    stopped: 'Загрузка прервалась',
    kept: 'То, что уже пришло, сохранено — повторная попытка продолжит с этого места.',
    keepOpen: 'Не закрывайте и не сворачивайте приложение во время загрузки. Если оно всё же закроется, загрузка продолжится с того же места.',
    threshold:
      'Файлы больше {size} МБ (видео, архивы) заранее не загружаются — они откроются по запросу. Это меняется в «Настройки → Файлы на устройстве».',
    retry: 'Повторить',
    open: 'Открыть ArxHub',
    busy: 'Загрузка…',
  },
  errors: {
    SyncSettingsUnreadableError: {
      title: 'Настройки синхронизации недоступны',
      message: 'Не удалось прочитать настройки синхронизации этого устройства',
    },
  },
}
