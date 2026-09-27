import type { Translation } from '@arxhub/i18n'
import type { en } from './en'

export const ru: Translation<typeof en> = {
  type: {
    title: 'Публикации',
    summary: 'Доступ по ссылке',
    sheetTitle: 'Пути',
  },
  settings: {
    title: 'Публикация',
    description: 'Открывайте выбранные документы и папки по публичным ссылкам.',
  },
  config: {
    serverUrl: { title: 'Адрес сервера', description: 'Адрес сервера ArxHub, например https://hub.example.com' },
    'history.limit': { title: 'Длина истории', description: 'Сколько публикаций запоминается — к любой из них можно откатиться.' },
  },
  warning: {
    file: '«{name}» и его вложения будут загружены без шифрования, и их сможет прочитать любой, у кого есть ссылка. Снятие с публикации прекращает раздачу, но не вернёт уже скачанные копии.',
    folder:
      '«{name}» и всё, что в ней лежит, включая вложения, будет загружено без шифрования, и это сможет прочитать любой, у кого есть ссылка. Снятие с публикации прекращает раздачу, но не вернёт уже скачанные копии.',
  },
  action: {
    publish: 'Опубликовать',
    republish: 'Опубликовать заново',
    unpublish: 'Снять с публикации',
    copyPublicLink: 'Скопировать публичную ссылку',
    copyLink: 'Скопировать ссылку',
    openInBrowser: 'Открыть в браузере',
    rollBack: 'Откатить',
    cancel: 'Отмена',
    more: 'Другие действия с публикацией',
    menuTitle: 'Публикация',
  },
  toast: {
    published: 'Опубликовано',
    unpublished: 'Снято с публикации',
    linkCopied: 'Ссылка скопирована',
    rolledBack: 'Откачено',
    rolledBackDescription: 'Снова опубликовано: {counts}',
  },
  failed: {
    publish: 'Не удалось опубликовать {path}',
    unpublish: 'Не удалось снять с публикации {path}',
    copyLink: 'Не удалось скопировать ссылку на {path}',
    rollBack: 'Не удалось откатиться к {hash}',
  },
  export: {
    markdown: 'Экспорт в Markdown',
    html: 'Экспорт в HTML',
    print: 'Печать / Сохранить PDF',
    failed: 'Не удалось экспортировать',
    printFailed: 'Не удалось напечатать',
  },
  counts: {
    roots: { one: '{count} корень', few: '{count} корня', many: '{count} корней', other: '{count} корня' },
    files: { one: '{count} файл', few: '{count} файла', many: '{count} файлов', other: '{count} файла' },
    paths: {
      one: '{count} опубликованный путь',
      few: '{count} опубликованных пути',
      many: '{count} опубликованных путей',
      other: '{count} опубликованного пути',
    },
  },
  bar: {
    nothingPublished: 'Ничего не опубликовано',
    off: 'Публикация выключена',
  },
  page: {
    offMeta: 'Публикация выключена — укажите адрес сервера в Настройках',
    published: 'Опубликовано',
    history: 'История',
    empty: 'Ничего не опубликовано. Опубликуйте документ или папку из дерева.',
    offHint: 'Включите публикацию, чтобы открывать документы и папки по ссылке.',
    historyEmpty: 'История начнётся с первой публикации.',
    current: 'Текущая',
  },
  kind: {
    publish: 'Опубликовано',
    unpublish: 'Снято с публикации',
    rollback: 'Откачено',
  },
  sheet: {
    label: 'Опубликованные пути',
    empty: 'Ничего не опубликовано.',
  },
  errors: {
    PublishStorageUnavailableError: { title: 'Хранилище публикаций недоступно', message: 'Хранилище публикаций недоступно' },
    PublishExportUnsavedError: { title: 'Документ не сохранён', message: 'Сохраните или восстановите документ перед экспортом' },
    PublishUnsavedError: { title: 'Документы не сохранены', message: 'Сохраните или восстановите открытые документы перед публикацией' },
    PublishExportUnsupportedError: { title: 'Экспорт невозможен', message: 'Установленные плагины не умеют экспортировать этот документ' },
    PublishNotConfiguredError: {
      title: 'Публикация выключена',
      message: 'Публикация не настроена — укажите адрес сервера и фразу восстановления в Настройках',
    },
    PublicationNotInHistoryError: { title: 'Публикация не найдена', message: 'Публикации {publication} нет в истории' },
    PublicationGoneError: { title: 'Публикации больше нет', message: 'На сервере больше нет публикации {publication}' },
    PublishHistoryMovedError: {
      title: 'Публикация изменилась',
      message: 'Публикацию изменили на другом устройстве, пока вы смотрели историю, — посмотрите ещё раз, прежде чем откатываться',
    },
    PublishHeadMovedError: { title: 'Публикация изменилась', message: 'Публикация изменилась во время загрузки — опубликуйте ещё раз' },
  },
}
