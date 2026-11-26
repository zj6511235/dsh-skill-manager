/**
 * Error type shared by the Host routes and the CLI.
 *
 * Every refusal the store makes carries a stable machine code plus an HTTP
 * status, so the Web panel can show the Host's own sentence instead of a bare
 * "HTTP 500", and the CLI can exit non-zero with the same code. Messages never
 * carry credentials, absolute-home details or child-process environment values.
 */
export type SkillManagerErrorCode =
  | 'invalid-source'
  | 'invalid-manifest'
  | 'unsupported-archive'
  | 'fetch-failed'
  | 'timeout'
  | 'conflict'
  | 'not-found'
  | 'busy'
  | 'permission'
  | 'dependency-failed'
  | 'cancelled'
  | 'internal'

export class SkillManagerError extends Error {
  readonly code: SkillManagerErrorCode
  readonly status: number
  readonly detail: string | undefined

  constructor(code: SkillManagerErrorCode, message: string, options: { status?: number; detail?: string } = {}) {
    super(message)
    this.name = 'SkillManagerError'
    this.code = code
    this.status = options.status ?? statusForCode(code)
    this.detail = options.detail
  }
}

export function statusForCode(code: SkillManagerErrorCode): number {
  switch (code) {
    case 'invalid-source':
    case 'invalid-manifest':
    case 'unsupported-archive':
      return 400
    case 'not-found':
      return 404
    case 'conflict':
      return 409
    case 'busy':
      return 429
    case 'permission':
      return 403
    case 'timeout':
      return 504
    case 'fetch-failed':
    case 'dependency-failed':
      return 502
    default:
      return 500
  }
}

export function isSkillManagerError(value: unknown): value is SkillManagerError {
  return value instanceof SkillManagerError
}

export function errorMessage(value: unknown): string {
  if (value instanceof Error) return value.message
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}
