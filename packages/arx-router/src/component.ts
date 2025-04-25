import { UrlMatcher } from './url-matcher'

interface Route {
  title: string | null
  component: string
}

interface ActiveRoute extends Route {
  params: Record<string, string>
}

export class ArxRouter extends HTMLElement {
  private matcher: UrlMatcher<Route>
  private current: ActiveRoute | null

  constructor() {
    super()
    this.matcher = new UrlMatcher()
    this.current = null
  }

  private readonly handlePopstate = () => {
    this.navigate(window.location.pathname)
  }

  private readonly handleNavigate = (event: CustomEvent<{ url: string }>) => {
    this.navigate(event.detail.url)
  }

  connectedCallback() {
    this.matcher = new UrlMatcher()
    for (const route of this.querySelectorAll('arx-route')) {
      const path = route.getAttribute('path')
      if (path == null) {
        console.error('Path attribute not found in:', route)
        return
      }

      const component = route.getAttribute('component')
      if (component == null) {
        console.error('Component attribute not found in:', route)
        return
      }

      const title = route.getAttribute('title')
      this.matcher.add(path, { title, component })
    }

    this.navigate(window.location.pathname)

    window.addEventListener('popstate', this.handlePopstate)
    window.addEventListener('arx-navigate', this.handleNavigate)
  }

  disconnectedCallback() {
    window.removeEventListener('popstate', this.handlePopstate)
    window.removeEventListener('arx-navigate', this.handleNavigate)
  }

  private get outlet() {
    return this.querySelector('arx-outlet')
  }

  private navigate(url: string) {
    const matched = this.matcher.find(url)

    if (matched == null) {
      console.warn(`No route matched for URL: ${url}`)
      return
    }

    this.current = { ...matched.store, params: matched.params }
    window.history.pushState(null, '', url)
    this.invalidate()
  }

  private invalidate() {
    const current = this.current
    const outlet = this.outlet

    if (outlet == null) return

    // Clear outlet before update
    while (outlet.firstChild) {
      outlet.removeChild(outlet.firstChild)
    }

    // Keep empty if no active
    if (current == null) return

    const { title, params, component } = current
    document.title = title || document.title

    const page = document.createElement(component)
    for (const key in params) {
      if (key === '*') continue
      page.setAttribute(key, params[key])
    }
    outlet.appendChild(page)
  }
}

customElements.define('wc-router', ArxRouter)

declare global {
  interface GlobalEventHandlersEventMap {
    'arx-navigate': CustomEvent<{ url: string }>
  }
}
