import type { Translation } from '@arxhub/i18n'
import type { en } from './en'

export const ru: Translation<typeof en> = {
  viewer: {
    image: 'Изображение',
    audio: 'Аудио',
    video: 'Видео',
    pdf: 'PDF',
    preview: 'Просмотр',
  },
  loading: 'Загрузка…',
  openExternal: 'Открыть в системном приложении',
  openExternalFailed: 'Не удалось открыть файл в системном приложении',
  media: {
    notMedia: 'Это не медиафайл',
    tooLarge: 'Файл {size} слишком большой, чтобы загрузить его на этом устройстве без потоковой передачи',
    loadFailed: 'Не удалось загрузить файл',
    streamed: '{size} · потоком',
  },
  pdf: {
    pageCount: { one: '{count} страница', few: '{count} страницы', many: '{count} страниц' },
    pageOf: 'Страница {page} из {count}',
    pages: 'Страницы',
    page: 'Страница {page}',
    zoomOut: 'Уменьшить',
    zoomIn: 'Увеличить',
    zoomReset: 'Сбросить масштаб ({percent})',
    openFailed: 'Не удалось открыть PDF',
    readFailed: 'Не удалось прочитать PDF',
  },
}
