import { SSEEventSchema, EvalRunArraySchema } from './types'
import type { SSEEvent, EvalRun } from './types'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

export async function* streamResearch(topic: string): AsyncGenerator<SSEEvent> {
  const res = await fetch(`${API_BASE}/api/research`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail ?? `Request failed: ${res.status}`)
  }

  if (!res.body) throw new Error('No response body')
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

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

      const parsed = JSON.parse(dataStr)

      // Build the raw event object, then validate with Zod
      let raw: unknown
      if (eventType === 'start') raw = { type: 'start', ...parsed }
      else if (eventType === 'node_complete') raw = { type: 'node_complete', ...parsed }
      else if (eventType === 'eval_start') raw = { type: 'eval_start' }
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
}

export async function* streamRefine(runId: string): AsyncGenerator<SSEEvent> {
  const res = await fetch(`${API_BASE}/api/research/${runId}/refine`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail ?? `Request failed: ${res.status}`)
  }

  if (!res.body) throw new Error('No response body')
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

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

      const parsed = JSON.parse(dataStr)

      let raw: unknown
      if (eventType === 'start') raw = { type: 'start', ...parsed }
      else if (eventType === 'node_complete') raw = { type: 'node_complete', ...parsed }
      else if (eventType === 'eval_start') raw = { type: 'eval_start' }
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
}

export async function fetchEvals(): Promise<EvalRun[]> {
  const res = await fetch(`${API_BASE}/api/evals`)
  if (!res.ok) throw new Error(`Failed to fetch evals: ${res.status}`)
  const data = await res.json()
  return EvalRunArraySchema.parse(data)
}
