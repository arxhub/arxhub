import type { Translation } from '@arxhub/i18n'
import type { en } from './en'

export const ru: Translation<typeof en> = {
  types: 'Типы',
  typeOpen: '{title}, открыто: {count}',
  sheet: {
    title: 'Открыть или переключиться',
    open: 'Сейчас открыто',
    openEmpty: 'Пока ничего не открыто.',
    new: 'Открыть новое',
    newEmpty: 'Ни одного типа не зарегистрировано.',
    allOpen: 'Открыто всё.',
    openCount: 'открыто: {count}',
    notInRow: 'нет в ряду',
    close: 'Закрыть «{title}»',
  },
  more: 'Ещё',
  moreHidden: 'Ещё, нет в ряду: {count}',
  moreActions: 'Ещё действия',
  nav: {
    collapse: 'Свернуть навигацию',
    collapseWith: 'Свернуть навигацию ({chord})',
    expand: 'Развернуть навигацию',
    resize: 'Ширина навигации «{title}»',
    resizeHint: 'Перетащите или нажимайте стрелки, чтобы изменить ширину',
    close: 'Закрыть',
  },
  stage: {
    nothing: 'Ничего не открыто.',
    pickDesktop: 'Выберите тип слева.',
    pickMobile: 'Выберите тип в ряду ниже.',
  },
  status: {
    goTo: 'Перейти к тому, что выполняется: {label}',
    rest: 'и ещё {count}',
  },
  tabs: {
    heading: 'Вкладки · {count}',
    empty: 'Здесь пока ничего не открыто.',
    current: 'Текущая вкладка',
    open: 'Открыта',
    gone: 'Пропала',
  },
  gone: {
    title: 'Этого объекта больше нет',
    message: 'Возможно, его переименовали или удалили на другом устройстве. Вкладка осталась, чтобы потеря была заметна.',
    close: 'Закрыть вкладку',
  },
  exit: {
    title: 'Выйти из ArxHub?',
    message: 'Закрывать больше нечего, поэтому «Назад» закрывает приложение.',
    confirm: 'Выйти',
    cancel: 'Отмена',
  },
  about: {
    title: 'О программе',
    description: 'Называйте эту версию, когда сообщаете о проблеме, — журнал сеанса тоже её записывает.',
    version: 'Версия',
    checking: 'Проверка…',
    check: 'Проверить обновления',
    current: 'У вас последняя версия.',
    failed: 'Не удалось проверить GitHub Releases.',
    available: 'Доступна версия {version}.',
    download: 'Открыть страницу загрузки',
  },
}
