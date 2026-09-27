import type { Translation } from '@arxhub/i18n'
import type { en } from './en'

export const ru: Translation<typeof en> = {
  errors: {
    FileNotFound: { title: 'Файл не найден', message: 'Этого файла больше нет.' },
    MountNotFound: { title: 'Расположение не найдено', message: 'По этому пути ничего не подключено.' },
    ScopeAccessDenied: { title: 'Доступ запрещён', message: 'Этот путь вне того, к чему есть доступ у этой части приложения.' },
  },
}
