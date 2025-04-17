import Elysia from 'elysia'

export function healthcheckRoute(): Elysia {
  return new Elysia().get('/healthcheck', () => '200 OK')
}
