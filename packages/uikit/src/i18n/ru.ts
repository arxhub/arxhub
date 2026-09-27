import type { Translation } from '@arxhub/i18n'
import type { en } from './en'

export const ru: Translation<typeof en> = {
  close: 'Закрыть',
  cancel: 'Отмена',
  confirm: 'Подтвердить',
  create: 'Создать',
  dismiss: 'Скрыть',
  actions: 'Действия',
  avatar: 'Аватар',
  chips: {
    add: 'Добавить…',
    remove: 'Убрать {name}',
  },
  number: {
    decrease: 'Меньше',
    increase: 'Больше',
  },
  search: {
    clear: 'Очистить поиск',
  },
  inspector: {
    close: 'Закрыть настройки',
  },
  formatting: {
    title: 'Форматирование',
    more: 'Ещё форматирование',
    hideKeyboard: 'Скрыть клавиатуру',
  },
  zoom: {
    out: 'Уменьшить',
    in: 'Увеличить',
    reset: 'Сбросить масштаб',
  },
  camera: {
    denied: 'Доступ к камере запрещён — введите код вручную',
    none: 'На этом устройстве нет камеры — введите код вручную',
    busy: 'Камера занята другим приложением — введите код вручную',
    failed: 'Не удалось включить камеру — введите код вручную',
    unsupported: 'Этот браузер не может использовать камеру — введите код вручную',
  },
}
