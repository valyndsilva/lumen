import { describe, it, expect } from 'vitest'
import {
  SSEEventSchema,
  SSEErrorSchema,
  ErrorCodeSchema,
  EvalScoresSchema,
  RunResultSchema,
  NodeNameSchema,
  ReflectionActionSchema,
} from '@/lib/types'

describe('SSEEventSchema', () => {
  it('parses a start event', () => {
    const result = SSEEventSchema.safeParse({
      type: 'start',
      run_id: 'abc-123',
      topic: 'AI agents',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.type).toBe('start')
    }
  })

  it('parses a node_complete event', () => {
    const result = SSEEventSchema.safeParse({
      type: 'node_complete',
      node: 'planner',
      timing_ms: 150,
      iteration: 0,
      meta: { queries: 2 },
    })
    expect(result.success).toBe(true)
  })

  it('parses an eval_start event', () => {
    const result = SSEEventSchema.safeParse({ type: 'eval_start' })
    expect(result.success).toBe(true)
  })

  it('parses a cancelled event', () => {
    const result = SSEEventSchema.safeParse({
      type: 'cancelled',
      run_id: 'abc-123',
    })
    expect(result.success).toBe(true)
  })

  it('parses an error event with code', () => {
    const result = SSEEventSchema.safeParse({
      type: 'error',
      code: 'llm',
      detail: 'Rate limit hit',
    })
    expect(result.success).toBe(true)
    if (result.success && result.data.type === 'error') {
      expect(result.data.code).toBe('llm')
    }
  })

  it('parses an error event without code — defaults to unknown', () => {
    const result = SSEEventSchema.safeParse({
      type: 'error',
      detail: 'Something failed',
    })
    expect(result.success).toBe(true)
    if (result.success && result.data.type === 'error') {
      expect(result.data.code).toBe('unknown')
    }
  })

  it('parses a complete event', () => {
    const result = SSEEventSchema.safeParse({
      type: 'complete',
      data: {
        draft: 'Article text',
        sources: ['https://example.com'],
        scores: { quality: 4.2, relevance: 4.5, groundedness: 3.9 },
        node_timings: { planner: 100 },
        token_counts: { planner: { input: 50, output: 20 } },
        run_id: 'run-1',
      },
    })
    expect(result.success).toBe(true)
  })

  it('rejects an unknown event type', () => {
    const result = SSEEventSchema.safeParse({
      type: 'unknown_event',
      data: {},
    })
    expect(result.success).toBe(false)
  })
})

describe('ErrorCodeSchema', () => {
  it.each(['llm', 'search_provider', 'auth', 'database', 'unknown'])('accepts %s', (code) => {
    expect(ErrorCodeSchema.safeParse(code).success).toBe(true)
  })

  it('rejects invalid code', () => {
    expect(ErrorCodeSchema.safeParse('invalid').success).toBe(false)
  })
})

describe('EvalScoresSchema', () => {
  it('accepts valid scores', () => {
    const result = EvalScoresSchema.safeParse({ quality: 4.2, relevance: 4.5, groundedness: 3.9 })
    expect(result.success).toBe(true)
  })

  it('rejects scores out of range', () => {
    const result = EvalScoresSchema.safeParse({ quality: 6.0, relevance: 4.5, groundedness: 3.9 })
    expect(result.success).toBe(false)
  })

  it('rejects negative scores', () => {
    const result = EvalScoresSchema.safeParse({ quality: -1, relevance: 4.5, groundedness: 3.9 })
    expect(result.success).toBe(false)
  })
})

describe('NodeNameSchema', () => {
  it.each(['planner', 'searcher', 'summariser', 'outliner', 'drafter', 'reflection'])('accepts %s', (name) => {
    expect(NodeNameSchema.safeParse(name).success).toBe(true)
  })

  it('rejects invalid node name', () => {
    expect(NodeNameSchema.safeParse('judge').success).toBe(false)
  })
})

describe('ReflectionActionSchema', () => {
  it.each(['accept', 'revise', 'research'])('accepts %s', (action) => {
    expect(ReflectionActionSchema.safeParse(action).success).toBe(true)
  })

  it('rejects invalid action', () => {
    expect(ReflectionActionSchema.safeParse('retry').success).toBe(false)
  })
})
