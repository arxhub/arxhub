// The ids this plugin registers under, in a module of their own so a surface can name one without
// importing the plugin that registers it — the rail opens the console panel, and the plugin imports the
// rail, so a shared constant on the plugin would close a cycle.
export const SEARCH_TYPE_ID = 'arxhub.search'

// The SQL console lives on the workspace's own panel store: a query is read where documents are read,
// beside the notes it is about.
export const SQL_CONSOLE_PANEL = 'arxhub.search.console'

export const SEARCH_SETTINGS_SECTION = 'search'
