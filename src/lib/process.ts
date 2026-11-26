/** Child-process helpers with bounded output, hard timeouts and secret redaction. */
import { spawn } from 'node:child_process'
import { appendFileSync, closeSync, mkdtempSync, openSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export interface RunOptions {
  cwd?: string
  env?: NodeJS.ProcessEnv
  timeoutMs?: number
  maxBytes?: number
  /** Append redacted output here when the command finishes. */
  logPath?: string
  signal?: AbortSignal
}

export interface RunResult {
  code: number | null
  stdout: string
  stderr: string
  timedOut: boolean
  aborted: boolean
}

const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[private-key]'],
  [/\bskh_[A-Za-z0-9]{12,}\b/g, '[redacted]'],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, '[redacted]'],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, '[redacted]'],
  [/(\bBearer\s+)[A-Za-z0-9._~+/-]{12,}=*/g, '$1[redacted]'],
  [/((?:token|password|passwd|secret|api[_-]?key)\s*[=:]\s*["']?)[^\s"']{8,}/gi, '$1[redacted]'],
]

/** Remove common credential shapes from text that may be logged or returned. */
export function redactSecrets(text: string): string {
  let output = text
  for (const [pattern, replacement] of SECRET_PATTERNS) output = output.replace(pattern, replacement)
  return output
}

function readTail(path: string, maxBytes: number): string {
  try {
    const buffer = readFileSync(path)
    return buffer.subarray(Math.max(0, buffer.length - maxBytes)).toString('utf8')
  } catch {
    return ''
  }
}

function appendLog(path: string | undefined, text: string): void {
  if (path === undefined || text.length === 0) return
  try {
    appendFileSync(path, text, 'utf8')
  } catch {
    /* a log write must never fail the operation */
  }
}

/**
 * Run one executable without a shell.
 *
 * Output goes to temporary files rather than pipes. That keeps a chatty npm /
 * git child from filling a pipe, bounds what is kept, and works in host
 * sandboxes that refuse to create the pipes a `stdio: 'pipe'` child needs.
 */
export function runProcess(command: string, args: readonly string[], options: RunOptions = {}): Promise<RunResult> {
  const timeoutMs = options.timeoutMs ?? 120_000
  const maxBytes = options.maxBytes ?? 1024 * 1024
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let timedOut = false
    let aborted = false
    let settled = false
    let timer: NodeJS.Timeout | undefined
    let captureDir: string | undefined
    let outFd: number | undefined
    let errFd: number | undefined

    const finish = (code: number | null): void => {
      if (settled) return
      settled = true
      if (timer !== undefined) clearTimeout(timer)
      if (outFd !== undefined) {
        try { closeSync(outFd) } catch { /* already closed */ }
      }
      if (errFd !== undefined) {
        try { closeSync(errFd) } catch { /* already closed */ }
      }
      if (captureDir !== undefined) {
        stdout = readTail(join(captureDir, 'stdout.txt'), maxBytes)
        stderr = readTail(join(captureDir, 'stderr.txt'), maxBytes)
        appendLog(options.logPath, `${stdout}${stderr}`)
        try { rmSync(captureDir, { recursive: true, force: true }) } catch { /* best effort */ }
      }
      resolve({ code, stdout: redactSecrets(stdout), stderr: redactSecrets(stderr), timedOut, aborted })
    }

    try {
      captureDir = mkdtempSync(join(tmpdir(), 'dsh-skm-'))
      const outPath = join(captureDir, 'stdout.txt')
      const errPath = join(captureDir, 'stderr.txt')
      outFd = openSync(outPath, 'w')
      errFd = openSync(errPath, 'w')
    } catch (error) {
      stderr = error instanceof Error ? error.message : String(error)
      finish(null)
      return
    }

    let child
    try {
      child = spawn(command, [...args], {
        cwd: options.cwd,
        env: { ...process.env, ...options.env },
        shell: false,
        windowsHide: true,
        stdio: ['ignore', outFd, errFd],
      })
    } catch (error) {
      stderr = error instanceof Error ? error.message : String(error)
      finish(null)
      return
    }

    child.on('error', (error) => {
      stderr += error.message
      finish(null)
    })
    child.on('close', (code) => finish(code))

    const stop = (): void => {
      if (child.pid === undefined) return
      try {
        if (process.platform === 'win32') {
          spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
        } else {
          child.kill('SIGKILL')
        }
      } catch {
        try {
          child.kill('SIGKILL')
        } catch {
          /* already gone */
        }
      }
    }

    timer = setTimeout(() => {
      timedOut = true
      stop()
    }, timeoutMs)
    options.signal?.addEventListener('abort', () => {
      aborted = true
      stop()
    }, { once: true })
  })
}

/** Whether an executable is resolvable on PATH. */
export async function commandExists(command: string): Promise<boolean> {
  const probe = process.platform === 'win32' ? 'where.exe' : 'which'
  const result = await runProcess(probe, [command], { timeoutMs: 10_000, maxBytes: 64 * 1024 })
  return result.code === 0
}
