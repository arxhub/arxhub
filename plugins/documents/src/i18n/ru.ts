import type { Translation } from '@arxhub/i18n'
import type { en } from './en'

export const ru: Translation<typeof en> = {
  type: {
    title: 'Документы',
    vault: 'Хранилище',
    vaultDetail: 'Все документы · поиск',
    newNote: 'Новый документ',
    openDocuments: 'Открытые документы',
    find: 'Найти документ…',
    newDocument: 'Новый документ',
  },
  defaultStem: 'Новый документ',
  nav: {
    off: 'Проводник выключен, поэтому дерева хранилища здесь нет.',
    offHint: 'Документы открываются из поиска.',
  },
  unsupported: {
    headline: 'Этот файл нечем открыть',
    hint: 'Ни один установленный просмотрщик не знает это расширение.',
    openExternally: 'Открыть в системном приложении',
    openFailed: 'Не удалось открыть файл в системном приложении',
  },
  actions: {
    rename: 'Переименовать',
    close: 'Закрыть',
    delete: 'Удалить',
    cancel: 'Отмена',
    deleteConfirm: 'Удалить «{name}»? Это действие нельзя отменить.',
    deleteFailed: 'Не удалось удалить {name}',
    renameFailed: 'Не удалось переименовать в {name}',
  },
  rename: {
    title: 'Переименовать',
    name: 'Название',
    newName: 'Новое название',
    confirm: 'Переименовать',
  },
  common: {
    unreported: 'Причина не сообщена — см. журнал.',
  },
  settings: {
    title: 'Документы',
    description: 'Как ArxHub называет файлы, которые умеет открывать.',
  },
  config: {
    groups: { names: 'Названия' },
    'names.hideKnownExtensions': {
      title: 'Скрывать известные расширения',
      description:
        'Файл, расширение которого знает установленный просмотрщик («.arx», «.md», …), показывается только по названию — и в дереве, и над открытым документом. На диске расширение остаётся; чтобы его изменить, выключите этот параметр.',
    },
  },
  errors: {
    DocumentNameEmptyError: { title: 'Нет названия', message: 'У файла должно быть название' },
    DocumentNameInvalidError: { title: 'Недопустимое название', message: '«{name}» нельзя использовать как название' },
    DocumentNameSlashError: {
      title: 'Недопустимое название',
      message: 'В названии не может быть косой черты — здесь файл переименовывают, а перемещают в дереве',
    },
    DocumentNameTakenError: { title: 'Название занято', message: '«{name}» уже есть в этой папке' },
  },
}
