import type { Translation } from '@arxhub/i18n'
import type { en } from './en'

export const ru: Translation<typeof en> = {
  tab: {
    close: 'Закрыть',
    moveLeft: 'Переместить влево',
    moveRight: 'Переместить вправо',
    movePrevious: 'В предыдущую область',
    moveNext: 'В следующую область',
  },
  split: {
    right: 'Разделить вправо',
    down: 'Разделить вниз',
    resize: 'Изменить размер панелей',
  },
  mobile: {
    empty: 'Документ не открыт',
    emptyHint: 'Выберите файл в хранилище или создайте новый кнопкой +.',
    open: 'Открытые документы',
    none: 'Нет открытых документов.',
  },
  desktop: {
    nothing: 'Ничего не открыто.',
    noPanels: 'Нет открытых панелей.',
  },
  deleted: 'Файл удалён',
}
