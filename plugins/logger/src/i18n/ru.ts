import type { Translation } from '@arxhub/i18n'
import type { en } from './en'

export const ru: Translation<typeof en> = {
  type: {
    title: 'Журнал',
    summary: 'События приложения',
    sheetTitle: 'Уровни',
  },
  levels: {
    debug: 'Отладка',
    info: 'Сведения',
    warn: 'Предупреждения',
    error: 'Ошибки',
    all: 'Все уровни',
    none: 'Ни одного уровня',
  },
  bar: {
    errors: { one: '{count} ошибка', few: '{count} ошибки', many: '{count} ошибок', other: '{count} ошибки' },
    reload: 'Обновить сеансы',
    clear: 'Очистить журнал',
  },
  sheet: {
    label: 'Уровни и сеансы журнала',
    levels: 'Уровни',
    session: 'Сеанс',
  },
  session: {
    live: 'Текущий',
    label: 'Сеанс журнала',
  },
  filter: {
    placeholder: 'Фильтр журнала…',
    label: 'Фильтр журнала',
  },
  panel: {
    reload: 'Обновить сеансы',
    clear: 'Очистить',
    empty: 'В журнале пусто.',
  },
  status: {
    open: 'Открыть журнал',
    name: 'Журнал',
  },
}
