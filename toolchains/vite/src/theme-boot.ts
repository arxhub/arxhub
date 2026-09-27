import type { Plugin } from 'vite'

const FILE = 'arxhub-theme-boot.js'

// Must match the key ThemeExtension writes (plugins/theme/src/theme-extension.ts).
const STORAGE_KEY = 'arxhub.theme'

// Must match LANGUAGE_STORAGE_KEY and pickLanguage in packages/i18n/src/language.ts. The rule is copied rather
// than imported because this runs before any module; the test beside it runs pickLanguage's own cases.
const LANGUAGE_KEY = 'arxhub.language'

// Runs before the first paint, before any module. The language block beside it answers the same need for text:
// the unlock gate and the crash screen read <html lang> back through @arxhub/i18n, so they speak the chosen
// language from their first frame.
//
// Before the theme: until ThemePlugin applies the chosen theme the page
// has no `data-theme`, and the Radix scales would stay on their light arm — a boot or crash screen at
// night would be a white flash. The theme this device applied last wins; with none saved, the system's
// light/dark setting. Plain ES5 on purpose — it runs before anything is known about the engine.
// The attributes alone do not reach the first frame: no stylesheet has loaded yet (in dev, or with the
// entry blocked), so the canvas would still paint white. A color-scheme <meta> sets the canvas before
// any CSS, and semantic.css's own `[data-theme] { color-scheme }` takes over once it loads. Not an
// inline `root.style.colorScheme`: that would outrank the stylesheet for the whole session, and a later
// switch to a light theme would keep dark scrollbars, controls and caret.
const SOURCE = `(function () {
  var root = document.documentElement
  var saved = null
  try { saved = JSON.parse(localStorage.getItem('${STORAGE_KEY}') || 'null') } catch (e) {}
  var base = saved && (saved.base === 'dark' || saved.base === 'light') ? saved.base : null
  if (!base) { try { base = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light' } catch (e) { base = 'light' } }
  if (!root.hasAttribute('data-theme')) root.setAttribute('data-theme', base)
  var meta = document.createElement('meta')
  meta.setAttribute('name', 'color-scheme')
  meta.setAttribute('content', root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light')
  document.head.appendChild(meta)
  if (saved && typeof saved.id === 'string' && !root.hasAttribute('data-arxhub-theme')) root.setAttribute('data-arxhub-theme', saved.id)
  var lang = null
  try { lang = localStorage.getItem('${LANGUAGE_KEY}') } catch (e) {}
  if (lang !== 'en' && lang !== 'ru') {
    lang = 'en'
    var tags = []
    try { tags = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ''] } catch (e) {}
    for (var i = 0; i < tags.length; i++) if (String(tags[i]).toLowerCase().indexOf('ru') === 0) { lang = 'ru'; break }
  }
  root.setAttribute('lang', lang)
})()
`

/**
 * Puts the last applied theme (else the system's light/dark base) and the interface language on the document before the app has loaded. A same-origin file
 * rather than an inline script, because the Tauri bundle's CSP (`script-src 'self'`) refuses inline scripts.
 * Assumes an absolute `base` ('/' or '/sub/'): the dev middleware matches `${base}${FILE}` literally.
 */
export function themeBoot(): Plugin {
  let base = '/'
  return {
    name: 'arxhub-theme-boot',
    configResolved(config) {
      base = config.base
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] !== `${base}${FILE}`) return next()
        res.setHeader('Content-Type', 'text/javascript; charset=utf-8')
        res.end(SOURCE)
      })
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: FILE, source: SOURCE })
    },
    transformIndexHtml() {
      return [{ tag: 'script', attrs: { src: `${base}${FILE}` }, injectTo: 'head-prepend' }]
    },
  }
}
