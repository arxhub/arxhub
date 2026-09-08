// The id the log viewer registers its type under, in a module of its own so a surface can name it
// without importing the plugin that registers it — the status item opens the type, and the plugin
// imports the status item, so a constant on the plugin would close a cycle.
export const LOGS_TYPE_ID = 'arxhub.logs'
