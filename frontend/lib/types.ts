import { z } from 'zod/v4'

// --- Node types ---

export const NodeNameSchema = z.enum(['planner', 'searcher', 'summariser', 'drafter', 'reflection'])
export type NodeName = z.infer<typeof NodeNameSchema>

export type NodeStatus = 'pending' | 'running' | 'complete'

export interface TraceNode {
  name: NodeName
  label: string
  status: NodeStatus
  timing_ms?: number
  iteration?: number
}

// --- Eval scores ---

export const EvalScoresSchema = z.object({
  quality: z.number().min(0).max(5),
  relevance: z.number().min(0).max(5),
  groundedness: z.number().min(0).max(5),
})
export type EvalScores = z.infer<typeof EvalScoresSchema>

// --- Run result (from SSE complete event) ---

export const RunResultSchema = z.object({
  draft: z.string(),
  sources: z.array(z.string()),
  scores: EvalScoresSchema,
  node_timings: z.record(z.string(), z.number()),
  token_counts: z.record(z.string(), z.object({
    input: z.number(),
    output: z.number(),
  })),
  run_id: z.string(),
})
export type RunResult = z.infer<typeof RunResultSchema>

// --- Eval run (from GET /api/evals) ---

export const EvalRunSchema = z.object({
  id: z.string(),
  topic: z.string(),
  created_at: z.string(),
  quality: z.number().nullable(),
  relevance: z.number().nullable(),
  groundedness: z.number().nullable(),
  latency_ms: z.number().nullable(),
  total_tokens: z.number().nullable(),
  estimated_cost_usd: z.number().nullable(),
  node_timings: z.string(),
  token_counts: z.string(),
})
export type EvalRun = z.infer<typeof EvalRunSchema>

export const EvalRunArraySchema = z.array(EvalRunSchema)

// --- SSE events ---

export const SSEStartSchema = z.object({
  type: z.literal('start'),
  run_id: z.string(),
  topic: z.string(),
})

export const SSENodeCompleteSchema = z.object({
  type: z.literal('node_complete'),
  node: NodeNameSchema,
  timing_ms: z.number().nullable(),
  iteration: z.number(),
})

export const SSEEvalStartSchema = z.object({
  type: z.literal('eval_start'),
})

export const SSECompleteSchema = z.object({
  type: z.literal('complete'),
  data: RunResultSchema,
})

export const SSEEventSchema = z.discriminatedUnion('type', [
  SSEStartSchema,
  SSENodeCompleteSchema,
  SSEEvalStartSchema,
  SSECompleteSchema,
])
export type SSEEvent = z.infer<typeof SSEEventSchema>
