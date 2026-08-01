import type { HttpContext } from '@adonisjs/core/http'
import { logBusinessEvent } from '#services/observability'

type AlertSeverity = 'warning' | 'critical'

type OperationalAlertInput = {
  area: 'admin' | 'api' | 'payment'
  attributes?: Record<string, unknown>
  message: string
  severity: AlertSeverity
}

export function buildOperationalAlertEvent(input: OperationalAlertInput) {
  return {
    event: `alert.${input.area}.${input.severity}`,
    attributes: {
      alertArea: input.area,
      alertSeverity: input.severity,
      alertMessage: input.message,
      ...(input.attributes ?? {}),
    },
  }
}

export function emitOperationalAlert(
  ctx: Pick<HttpContext, 'logger'>,
  input: OperationalAlertInput
) {
  const alert = buildOperationalAlertEvent(input)
  logBusinessEvent(
    ctx,
    alert.event,
    alert.attributes,
    input.severity === 'critical' ? 'error' : 'warn'
  )
}
