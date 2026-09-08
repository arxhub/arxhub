// The id settings registers its type under, in a module of its own so a surface can name it without
// importing the plugin — four status items across three other plugins lead here ("you have unsaved
// settings", "maintenance mode", "sync settings", "this device was refused"), and each of them spelled
// the string out for itself before this existed.
export const SETTINGS_TYPE_ID = 'arxhub.settings'
