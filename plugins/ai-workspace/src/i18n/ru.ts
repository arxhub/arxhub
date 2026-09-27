import type { Translation } from '@arxhub/i18n'
import type { en } from './en'

export const ru: Translation<typeof en> = {
  title: 'AI',
  description: 'Проверьте сессии агента в его рабочей копии, прежде чем правки попадут в основное хранилище.',
  sessionCount: { one: '{count} сессия', few: '{count} сессии', many: '{count} сессий' },
  changeCount: { one: '{count} изменение', few: '{count} изменения', many: '{count} изменений' },
  sessions: 'Сессии',
  allSessions: 'Все сессии',
  sessionsNav: 'Сессии AI',
  changesNav: 'Изменения сессии',
  sourcesNav: 'Источники сессии',
  proposal: 'Предложение агента',
  proposalFiles: 'Файлы предложения',
  empty: 'Сессий агента пока нет.',
  status: 'Статус: {status}',
  statusWithResult: 'Статус: {status} ({result})',
  base: 'Основа: {hash}',
  changes: 'Изменения',
  sources: 'Источники',
  noSources: 'Источников пока нет.',
  actions: 'Действия',
  actionOk: 'успешно',
  actionError: 'ошибка',
  open: 'Открыть',
  compareMode: 'Что сравнивать',
  loadingDiff: 'Сравнение загружается…',
  acceptAll: 'Принять всё',
  reject: 'Отклонить',
  refresh: 'Обновить',
  backToProposal: 'Назад к предложению',
  mode: 'Режим: {mode}',
  modes: {
    agent: 'Агент (основа → рабочая копия)',
    apply: 'Применение (рабочая копия → хранилище)',
  },
  sides: {
    Base: 'Основа',
    Worktree: 'Рабочая копия',
    Main: 'Хранилище',
  },
  sessionStatus: {
    open: 'открыта',
    proposed: 'предложена',
    archived: 'в архиве',
  },
  sessionResult: {
    accepted: 'принята',
    rejected: 'отклонена',
  },
  changeKind: {
    created: 'создан',
    modified: 'изменён',
    renamed: 'переименован',
    deleted: 'удалён',
  },
  errors: {
    AiSourceMissing: { title: 'AI', message: 'Файл источника недоступен: {path}' },
    AiSourceNotOpened: { title: 'AI', message: 'Не удалось открыть источник: {path}' },
    AiWorkspaceAcceptConflictError: {
      title: 'Не принято',
      message: '{path} изменился в хранилище после предложения. Проверьте его и примите снова.',
    },
    AiWorkspaceAcceptUnsavedError: {
      title: 'Не принято',
      message: 'В {path} есть несохранённые изменения. Сохраните или отмените их и примите снова.',
    },
    AiWorkspaceSessionArchivedError: {
      title: 'Сессия в архиве',
      message: 'Сессия в архиве: изменений она больше не принимает, и принять её снова нельзя.',
    },
  },
}
