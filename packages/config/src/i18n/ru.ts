import type { Translation } from '@arxhub/i18n'
import type { en } from './en'

export const ru: Translation<typeof en> = {
  field: {
    unavailable: 'Недоступно',
    required: 'Обязательно',
    deviceLocal: 'Только на этом устройстве',
    deviceOnly: 'только это устройство',
    range: 'От {min} до {max}',
    atLeast: 'Не меньше {min}',
    upTo: 'До {max}',
    availableOnce: 'Доступно, когда включено «{name}».',
    copy: 'Копировать',
    copied: '{name}: скопировано',
    copyFailed: 'Не удалось скопировать',
    show: 'Показать',
    hide: 'Скрыть',
  },
  form: {
    technical: 'Технические подробности',
    hideTechnical: 'Скрыть технические подробности',
  },
  validation: {
    required: 'Поле «{name}» обязательно.',
    notANumber: 'Это не число.',
    min: 'Не меньше {min}.',
    max: 'Не больше {max}.',
    maxLength: 'Не больше {max} символов.',
    pattern: 'Значение не подходит под формат поля.',
  },
}
