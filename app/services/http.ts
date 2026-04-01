export interface ApiErrorPayload {
  code: string
  message: string
  details?: Record<string, unknown>
}

export class ApiHttpError extends Error {
  constructor(
    public status: number,
    public payload: ApiErrorPayload
  ) {
    super(payload.message)
  }
}

export function dataResponse<T>(
  data: T,
  options?: { meta?: Record<string, unknown>; message?: string }
) {
  const body: Record<string, unknown> = { data }

  if (options?.meta) {
    body.meta = options.meta
  }

  if (options?.message) {
    body.message = options.message
  }

  return body
}

export function errorResponse(payload: ApiErrorPayload) {
  return { error: payload }
}

export function parsePositiveInt(
  value: unknown,
  fallback: number,
  limits?: { min?: number; max?: number }
) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  const min = limits?.min ?? 1
  const max = limits?.max ?? Number.MAX_SAFE_INTEGER

  if (!Number.isFinite(parsed) || parsed < min) {
    return fallback
  }

  return Math.min(parsed, max)
}
