import Elysia, { type AnyElysia } from 'elysia'

export function healthcheckRoute(): AnyElysia {
  return new Elysia().get('/healthcheck', () => '200 OK')
}
