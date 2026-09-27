export const en = {
  viewer: {
    image: 'Image',
    audio: 'Audio',
    video: 'Video',
    pdf: 'PDF',
    preview: 'Preview',
  },
  loading: 'Loading…',
  openExternal: 'Open in system app',
  openExternalFailed: 'Could not open the file in the system app',
  media: {
    notMedia: 'Not a media file',
    tooLarge: '{size} is too large to load without streaming on this device',
    loadFailed: 'Could not load the file',
    streamed: '{size} · streamed',
  },
  pdf: {
    pageCount: { one: '{count} page', other: '{count} pages' },
    pageOf: 'Page {page} of {count}',
    pages: 'Pages',
    page: 'Page {page}',
    zoomOut: 'Zoom out',
    zoomIn: 'Zoom in',
    zoomReset: 'Reset zoom ({percent})',
    openFailed: 'Could not open the PDF',
    readFailed: 'Could not read the PDF',
  },
} as const
