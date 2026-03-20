import { z } from 'zod/v4'

// --- Node types ---

export const NodeNameSchema = z.enum(['planner', 'searcher', 'summariser', 'outliner', 'drafter', 'reflection'])
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

const flexNum = z.unknown().transform((v) => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return isNaN(n) ? null : n
})

export const EvalRunSchema = z.object({
  id: z.string(),
  topic: z.string(),
  created_at: z.string(),
  quality: flexNum,
  relevance: flexNum,
  groundedness: flexNum,
  latency_ms: flexNum,
  total_tokens: flexNum,
  estimated_cost_usd: flexNum,
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

export const ReflectionActionSchema = z.enum(['accept', 'revise', 'research'])
export type ReflectionAction = z.infer<typeof ReflectionActionSchema>

export const NodeMetaSchema = z.object({
  queries: z.number().optional(),
  sources: z.number().optional(),
  summaries: z.number().optional(),
  sections: z.number().optional(),
  words: z.number().optional(),
  preview: z.unknown().optional(),  // planner: string[], searcher: {title,url}[], outliner: string
}).optional()
export type NodeMeta = z.infer<typeof NodeMetaSchema>

export const SSENodeCompleteSchema = z.object({
  type: z.literal('node_complete'),
  node: NodeNameSchema,
  timing_ms: z.number().nullable(),
  iteration: z.number(),
  reflection_action: ReflectionActionSchema.optional(),
  critique: z.string().optional(),
  meta: NodeMetaSchema,
})

export const SSEEvalStartSchema = z.object({
  type: z.literal('eval_start'),
})

export const SSECancelledSchema = z.object({
  type: z.literal('cancelled'),
  run_id: z.string(),
})

export const SSEErrorSchema = z.object({
  type: z.literal('error'),
  detail: z.string(),
})

export const SSECompleteSchema = z.object({
  type: z.literal('complete'),
  data: RunResultSchema,
})

export const SSEEventSchema = z.discriminatedUnion('type', [
  SSEStartSchema,
  SSENodeCompleteSchema,
  SSEEvalStartSchema,
  SSECancelledSchema,
  SSEErrorSchema,
  SSECompleteSchema,
])
export type SSEEvent = z.infer<typeof SSEEventSchema>

// --- Trace timeline ---

export type TraceStepType = 'node' | 'reflection_decision' | 'iteration_header'

export interface TraceStep {
  id: string
  type: TraceStepType
  node?: NodeName
  status: NodeStatus
  timing_ms?: number
  iteration: number
  // Reflection decision metadata
  reflectionAction?: ReflectionAction
  critique?: string
  // Node-specific stats from backend
  meta?: NodeMeta
}

// Grouped pass for TracePanel rendering
export interface TracePass {
  iteration: number
  steps: TraceStep[]
  decision?: TraceStep       // reflection_decision step (if any)
  totalTime?: number         // sum of node timing_ms
  totalSources?: number      // from searcher meta
  isComplete: boolean        // all nodes in this pass are complete
}
