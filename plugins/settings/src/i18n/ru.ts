import type { Translation } from '@arxhub/i18n'
import type { en } from './en'

export const ru: Translation<typeof en> = {
  type: {
    title: 'Настройки',
    sections: 'Разделы',
    summary: 'Приложение и устройство',
  },
  nav: {
    label: 'Разделы настроек',
  },
  page: {
    unknown: 'Неизвестный раздел настроек: {id}',
    none: 'Ни один плагин не добавил раздел настроек.',
  },
  pending: {
    title: 'Несохранённые изменения настроек',
    count: { one: '{count} несохранённая настройка', few: '{count} несохранённые настройки', many: '{count} несохранённых настроек' },
    sub: 'не сохранено: {count}',
    discard: 'Отменить изменения раздела',
  },
  changes: {
    applying: 'Применяется…',
    fields: { one: '{count} несохранённое изменение', few: '{count} несохранённых изменения', many: '{count} несохранённых изменений' },
    across: { one: '{changes} в {count} разделе', few: '{changes} в {count} разделах', many: '{changes} в {count} разделах' },
    applied: { one: 'Применено {count} изменение', few: 'Применено {count} изменения', many: 'Применено {count} изменений' },
    saveFailed: 'Не удалось сохранить «{name}»',
    unreported: 'Причина не сообщена — подробности в журнале.',
    blocked: 'Исправьте выделенные поля, чтобы применить',
    revert: 'Вернуть',
    apply: 'Сохранить и применить',
    hotkey: 'Сохранить и применить настройки',
  },
  language: {
    title: 'Язык',
    description: 'Язык интерфейса. Хранится только на этом устройстве — у других устройств свой выбор.',
    label: 'Язык интерфейса',
    system: 'Как в системе ({name})',
    systemHint: 'Следует языку, выбранному на этом устройстве',
  },
}
