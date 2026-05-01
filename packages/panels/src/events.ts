import '@arxhub/events'

declare module '@arxhub/events' {
  interface EventMap {
    'panel:opened': { instanceId: string; groupId: string; definitionId: string }
    'panel:closed': { instanceId: string; groupId: string }
    'panel:activated': { instanceId: string; groupId: string }
    'panel:deactivated': { instanceId: string; groupId: string }
    'group:created': { groupId: string }
    'group:closed': { groupId: string }
    'group:activated': { groupId: string }
  }
}
