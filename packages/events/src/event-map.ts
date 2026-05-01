// Extend via declaration merging in the package that owns the events:
//   declare module '@arxhub/events' { interface EventMap { 'my:event': { ... } } }
// biome-ignore lint/suspicious/noEmptyInterface: intentional extensibility point
export interface EventMap {}
