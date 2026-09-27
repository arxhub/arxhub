import type { Translation } from '@arxhub/i18n'
import type { en } from './en'

export const ru: Translation<typeof en> = {
  settings: { title: 'Файлы на устройстве' },
  config: {
    materializeUpTo: {
      title: 'Предельный размер файла на устройстве',
      description: '0 — хранить на устройстве всё; файлы крупнее остаются на сервере до открытия',
      unit: 'МБ',
    },
    'merge.textExtensions': {
      title: 'Объединять как текст',
      description:
        'Файлы с этими расширениями объединяются построчно, если их изменили на обоих устройствах; то, что всё ещё расходится, отмечается в файле. Всё остальное становится копией-конфликтом рядом с оригиналом.',
    },
  },
  errors: {
    RepositoryVersionOfflineError: { title: 'Версия на сервере', message: 'Подключитесь к серверу синхронизации, чтобы загрузить эту версию.' },
    RepositoryFileOfflineError: { title: 'Файл на сервере', message: 'Этот файл на сервере — включите синхронизацию, чтобы открыть его.' },
    RepositoryRangeOfflineError: { title: 'Нет в кэше', message: 'Этой части файла нет в кэше — включите синхронизацию и повторите.' },
    RepositoryStorageOfflineError: {
      title: 'Данные на сервере',
      message: 'Данные плагина «{plugin}» на сервере — включите синхронизацию, прежде чем им пользоваться.',
    },
    RepositoryStorageChangedError: {
      title: 'Данные изменились',
      message: 'Данные плагина «{plugin}» изменились во время подготовки — повторите действие.',
    },
    SyncHeadMovedError: {
      title: 'На сервере новые изменения',
      message: 'Другое устройство отправило изменения на сервер, пока шла эта синхронизация.',
    },
    RepoHeadMovedError: {
      title: 'Одновременная запись',
      message: 'Другая вкладка или устройство записали изменения одновременно; это изменение не сохранено.',
    },
  },
}
