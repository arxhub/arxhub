export { SEARCH_SETTINGS_SECTION, SEARCH_SIDEBAR_ITEM, SQL_CONSOLE_PANEL } from './contributions'
export { searchIndexUnavailable, searchIndexUnavailableErrorSchema } from './errors'
export { createIndexQueue, DEFAULT_DEBOUNCE_MS, type IndexQueue, type IndexQueueOptions } from './index-queue'
export {
  DEFAULT_SEARCH_SETTINGS,
  reindexRequired,
  type SearchConfig,
  SearchConfigSchema,
  type SearchSettings,
  toSearchSettings,
} from './search-config'
export { SEARCH_INDEX_UNAVAILABLE, SearchExtension, type SearchIndexStatus } from './search-extension'
export { SearchPlugin, type SearchPluginArgs } from './search-plugin'
export { default as SearchLayout } from './ui/SearchLayout.vue'
export { default as SearchRail } from './ui/SearchRail.vue'
export { default as SearchSettingsPage } from './ui/SearchSettingsPage.vue'
export { default as SqlConsolePanel } from './ui/SqlConsolePanel.vue'
export {
  createSearchController,
  DEFAULT_SEARCH_DEBOUNCE_MS,
  type SearchController,
  type SearchControllerOptions,
  searchOptionsFor,
} from './ui/search-controller'
export {
  DEFAULT_SEARCH_PREFERENCES,
  parseSearchPreferences,
  SEARCH_PREFERENCES_KEY,
  type SearchPreferences,
  serializeSearchPreferences,
  useSearchPreferences,
} from './ui/search-preferences'
export {
  createSqlConsoleController,
  formatCell,
  type SqlCell,
  type SqlConsoleController,
  type SqlConsoleControllerOptions,
} from './ui/sql-console-controller'
export { parseConsoleQuery, SQL_CONSOLE_EXAMPLE, SQL_CONSOLE_QUERY_KEY, useConsoleQuery } from './ui/sql-console-state'
export { type IndexStatusView, useIndexStatus } from './ui/use-index-status'
export { type OpenConsole, useOpenConsole } from './ui/use-open-console'
export { type OpenDocument, useOpenDocument } from './ui/use-open-document'
