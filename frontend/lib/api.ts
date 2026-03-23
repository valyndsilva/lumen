import { SSEEventSchema, EvalRunArraySchema } from './types'
import type { SSEEvent, EvalRun } from './types'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

// Auth token getter — set by the app when Clerk is ready
let _getToken: (() => Promise<string | null>) | null = null
let _lastToken: string | null = null

export function setAuthTokenGetter(getter: () => Promise<string | null>) {
  _getToken = getter
}

/** Returns the most recently fetched token (sync). Used for keepalive requests during page unload. */
export function getCachedAuthToken(): string | null {
  return _lastToken
}

async function authHeaders(): Promise<Record<string, string>> {
  if (!_getToken) return {}
  try {
    const token = await _getToken()
    _lastToken = token
    if (!token) return {}
    return { Authorization: `Bearer ${token}` }
  } catch {
    // Stale/invalid session — abort the request and redirect
    window.location.href = '/sign-in'
    throw new Error('Session expired')
  }
}

export interface ApiKeys {
  anthropic_api_key: string
}

export interface RateLimitError {
  code: 'rate_limit' | 'hourly_limit' | 'daily_limit' | 'global_daily_limit' | 'concurrent_limit'
  message: string
}

export class RateLimitExceededError extends Error {
  code: RateLimitError['code']
  constructor(info: RateLimitError) {
    super(info.message)
    this.code = info.code
    this.name = 'RateLimitExceededError'
  }
}

async function handleRateLimit(res: Response): Promise<never> {
  const text = await res.text()
  try {
    // FastAPI wraps detail as JSON string inside { "detail": "..." }
    const body = JSON.parse(text)
    const detail = typeof body.detail === 'string' ? JSON.parse(body.detail) : body.detail
    throw new RateLimitExceededError(detail)
  } catch (e) {
    if (e instanceof RateLimitExceededError) throw e
    throw new RateLimitExceededError({ code: 'rate_limit', message: 'Rate limit exceeded.' })
  }
}

function parseSSEStream(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const decoder = new TextDecoder()
  let buffer = ''

  return {
    async *events(): AsyncGenerator<SSEEvent> {
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const parts = buffer.split('\n\n')
          buffer = parts.pop() ?? ''

          for (const part of parts) {
            const lines = part.trim().split('\n')
            let eventType = ''
            let dataStr = ''
            for (const line of lines) {
              if (line.startsWith('event: ')) eventType = line.slice(7)
              if (line.startsWith('data: ')) dataStr = line.slice(6)
            }
            if (!eventType || !dataStr) continue

            let parsed: Record<string, unknown>
            try {
              parsed = JSON.parse(dataStr)
            } catch {
              console.warn('SSE JSON parse failed:', dataStr)
              continue
            }

            let raw: unknown
            if (eventType === 'start') raw = { type: 'start', ...parsed }
            else if (eventType === 'node_complete') raw = { type: 'node_complete', ...parsed }
            else if (eventType === 'eval_start') raw = { type: 'eval_start' }
            else if (eventType === 'cancelled') raw = { type: 'cancelled', ...parsed }
            else if (eventType === 'error') raw = { type: 'error', ...parsed }
            else if (eventType === 'complete') raw = { type: 'complete', data: parsed }
            else continue

            const result = SSEEventSchema.safeParse(raw)
            if (result.success) {
              yield result.data
            } else {
              console.warn('SSE validation failed:', result.error.issues, raw)
            }
          }
        }
      } finally {
        reader.cancel().catch(() => {})
      }
    }
  }
}

export async function* streamResearch(topic: string, domain: string = 'general', keys?: ApiKeys, signal?: AbortSignal): AsyncGenerator<SSEEvent> {
  const body: Record<string, string> = { topic, domain }
  if (keys) {
    body.anthropic_api_key = keys.anthropic_api_key
  }

  const auth = await authHeaders()
  const res = await fetch(`${API_BASE}/api/research`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify(body),
    signal,
  })

  if (res.status === 429) await handleRateLimit(res)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail ?? `Request failed: ${res.status}`)
  }

  if (!res.body) throw new Error('No response body')
  yield* parseSSEStream(res.body.getReader()).events()
}

export async function* streamRefine(runId: string, keys?: ApiKeys, signal?: AbortSignal): AsyncGenerator<SSEEvent> {
  const body: Record<string, string> = {}
  if (keys) {
    body.anthropic_api_key = keys.anthropic_api_key
  }

  const auth = await authHeaders()
  const res = await fetch(`${API_BASE}/api/research/${runId}/refine`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify(body),
    signal,
  })

  if (res.status === 429) await handleRateLimit(res)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail ?? `Request failed: ${res.status}`)
  }

  if (!res.body) throw new Error('No response body')
  yield* parseSSEStream(res.body.getReader()).events()
}

export function cancelResearch(runId: string | null): void {
  if (!runId) return
  // Use cached token (sync) instead of authHeaders (async) — cancel must be immediate
  const token = getCachedAuthToken()
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}
  fetch(`${API_BASE}/api/research/${runId}/cancel`, { method: 'POST', headers, keepalive: true }).catch(() => {})
}

export interface Domain {
  id: string
  label: string
}

export async function fetchDomains(): Promise<Domain[]> {
  const res = await fetch(`${API_BASE}/api/domains`)
  if (!res.ok) return [{ id: 'general', label: 'General Research' }]
  return res.json()
}

// --- Key management ---

export interface KeyStatus {
  has_key: boolean
  preview?: string
  created_at?: string
}

export async function checkKeys(): Promise<KeyStatus> {
  const auth = await authHeaders()
  const res = await fetch(`${API_BASE}/api/keys`, { headers: auth })
  if (res.status === 401) return { has_key: false } // Not authenticated yet
  if (!res.ok) throw new Error(`Failed to check keys: ${res.status}`)
  return res.json()
}

export async function saveKey(anthropicKey: string): Promise<void> {
  const auth = await authHeaders()
  const res = await fetch(`${API_BASE}/api/keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ anthropic_api_key: anthropicKey }),
  })
  if (!res.ok) throw new Error('Failed to save key')
}

export async function deleteKey(): Promise<void> {
  const auth = await authHeaders()
  const res = await fetch(`${API_BASE}/api/keys`, { method: 'DELETE', headers: auth })
  if (!res.ok) throw new Error('Failed to delete key')
}

export async function fetchEvals(): Promise<EvalRun[]> {
  const auth = await authHeaders()
  const res = await fetch(`${API_BASE}/api/evals`, { headers: auth })
  if (!res.ok) throw new Error(`Failed to fetch evals: ${res.status}`)
  const data = await res.json()
  return EvalRunArraySchema.parse(data)
}

export interface SavedRun {
  id: string
  topic: string
  created_at: string
  draft: string
  sources: string        // JSON array of URLs
  quality: number | null
  relevance: number | null
  groundedness: number | null
  evidence_strength: string | null
  latency_ms: number | null
  total_tokens: number | null
  estimated_cost_usd: number | null
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return isNaN(n) ? null : n
}

export async function fetchRun(runId: string): Promise<SavedRun> {
  const auth = await authHeaders()
  const res = await fetch(`${API_BASE}/api/research/${runId}`, { headers: auth })
  if (!res.ok) throw new Error(`Failed to fetch run: ${res.status}`)
  const data = await res.json()
  return {
    ...data,
    quality: toNum(data.quality),
    relevance: toNum(data.relevance),
    groundedness: toNum(data.groundedness),
    evidence_strength: data.evidence_strength ?? null,
    latency_ms: toNum(data.latency_ms),
    total_tokens: toNum(data.total_tokens),
    estimated_cost_usd: toNum(data.estimated_cost_usd),
  }
}
