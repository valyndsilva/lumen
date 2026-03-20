'use client'
import { useMemo } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { TraceStep, TracePass, NodeName, NodeMeta as NodeMetaData } from '@/lib/types'

interface NodeDisplay {
  label: string
  runningDescription: string
  revisionRunningDescription?: string
  description: (meta?: NodeMetaData) => string
  revisionDescription?: (meta?: NodeMetaData) => string
}

const STEP_NODES: NodeName[] = ['planner', 'searcher', 'summariser', 'outliner', 'drafter', 'reflection']

const NODE_DISPLAY: Record<NodeName, NodeDisplay> = {
  planner: {
    label: 'Planner',
    runningDescription: 'Generating search queries from topic...',
    description: (meta) => {
      const n = meta?.queries
      return n ? `Generated ${n} targeted search ${n === 1 ? 'query' : 'queries'}` : 'Generated search queries'
    },
  },
  searcher: {
    label: 'Searcher',
    runningDescription: 'Searching the web via Tavily API...',
    revisionRunningDescription: 'Searching for additional sources...',
    description: (meta) => {
      const n = meta?.sources
      return n ? `Retrieved ${n} ${n === 1 ? 'source' : 'sources'} via Tavily` : 'Retrieved sources via Tavily'
    },
    revisionDescription: (meta) => {
      const n = meta?.sources
      return n ? `Found ${n} additional ${n === 1 ? 'source' : 'sources'}` : 'Retrieved additional sources'
    },
  },
  summariser: {
    label: 'Summariser',
    runningDescription: 'Extracting key facts from sources...',
    revisionRunningDescription: 'Summarising new sources...',
    description: (meta) => {
      const n = meta?.summaries
      return n ? `Extracted facts from ${n} ${n === 1 ? 'source' : 'sources'}` : 'Extracted key facts'
    },
    revisionDescription: (meta) => {
      const n = meta?.summaries
      return n ? `Summarised ${n} new ${n === 1 ? 'source' : 'sources'}` : 'Summarised new sources'
    },
  },
  outliner: {
    label: 'Outliner',
    runningDescription: 'Planning article structure...',
    description: (meta) => {
      const n = meta?.sections
      return n ? `Planned ${n} sections with source assignments` : 'Planned article structure'
    },
  },
  drafter: {
    label: 'Drafter',
    runningDescription: 'Writing structured article from research...',
    revisionRunningDescription: 'Revising draft with critique feedback...',
    description: (meta) => {
      const n = meta?.words
      return n ? `Wrote ${n.toLocaleString()}-word article` : 'Wrote structured article'
    },
    revisionDescription: (meta) => {
      const n = meta?.words
      return n ? `Revised to ${n.toLocaleString()} words` : 'Revised draft'
    },
  },
  reflection: {
    label: 'Reflection',
    runningDescription: 'Evaluating draft quality...',
    description: () => 'Evaluated quality and coverage',
  },
}

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  revise:   { label: 'Revising',    color: 'var(--color-accent-amber)' },
  research: { label: 'Researching', color: 'var(--color-accent-blue)' },
  accept:   { label: 'Accepted',    color: 'var(--color-accent-emerald)' },
}

function groupIntoPasses(steps: TraceStep[]): TracePass[] {
  const passMap = new Map<number, TracePass>()

  for (const step of steps) {
    if (step.type === 'reflection_decision') {
      const pass = passMap.get(step.iteration)
      if (pass) pass.decision = step
      continue
    }
    if (step.type === 'iteration_header') continue

    const iter = step.iteration
    if (!passMap.has(iter)) {
      passMap.set(iter, { iteration: iter, steps: [], isComplete: false, totalTime: 0, totalSources: 0 })
    }
    passMap.get(iter)!.steps.push(step)
  }

  for (const pass of passMap.values()) {
    const nodeSteps = pass.steps.filter(s => s.type === 'node')
    pass.isComplete = nodeSteps.length > 0 && nodeSteps.every(s => s.status === 'complete')
    pass.totalTime = nodeSteps.reduce((sum, s) => sum + (s.timing_ms ?? 0), 0)
    const searcherStep = nodeSteps.find(s => s.node === 'searcher')
    pass.totalSources = searcherStep?.meta?.sources ?? 0
  }

  return Array.from(passMap.values()).sort((a, b) => a.iteration - b.iteration)
}

interface TracePanelProps {
  steps: TraceStep[]
  isEvaluating: boolean
  compact?: boolean  // hide detail card + pass history (article view)
}

export default function TracePanel({ steps, isEvaluating, compact = false }: TracePanelProps) {
  const passes = useMemo(() => groupIntoPasses(steps), [steps])
  const currentPass = passes[passes.length - 1]
  const completedPasses = passes.slice(0, -1).filter(p => p.isComplete)

  // Find the active/running step and build status map for the current pass
  const currentNodes = currentPass?.steps.filter(s => s.type === 'node') ?? []
  const runningStep = currentNodes.find(s => s.status === 'running')
  const lastCompleteStep = [...currentNodes].reverse().find(s => s.status === 'complete')

  // Build status for each node in the horizontal stepper
  // Start with completed passes (all their nodes are complete),
  // then overlay the current pass's statuses on top
  const nodeStatusMap = useMemo(() => {
    const map: Record<NodeName, { status: 'pending' | 'running' | 'complete'; step?: TraceStep }> = {
      planner: { status: 'pending' },
      searcher: { status: 'pending' },
      summariser: { status: 'pending' },
      outliner: { status: 'pending' },
      drafter: { status: 'pending' },
      reflection: { status: 'pending' },
    }
    // Mark nodes from completed passes as complete
    for (const pass of completedPasses) {
      for (const step of pass.steps) {
        if (step.node && step.status === 'complete') {
          map[step.node] = { status: 'complete', step }
        }
      }
    }
    // Overlay current pass — running/pending override completed-pass status
    for (const step of currentNodes) {
      if (step.node) {
        map[step.node] = { status: step.status, step }
      }
    }
    return map
  }, [currentNodes, completedPasses])

  // Determine what to show in the detail area
  const activeStep = runningStep ?? lastCompleteStep
  const activeDisplay = activeStep?.node ? NODE_DISPLAY[activeStep.node] : null
  const isRevision = (currentPass?.iteration ?? 0) > 0

  // Description for the active node
  let activeDescription = ''
  if (activeStep && activeDisplay) {
    if (activeStep.status === 'running') {
      activeDescription = isRevision && activeDisplay.revisionRunningDescription
        ? activeDisplay.revisionRunningDescription
        : activeDisplay.runningDescription
    } else {
      activeDescription = isRevision && activeDisplay.revisionDescription
        ? activeDisplay.revisionDescription(activeStep.meta)
        : activeDisplay.description(activeStep.meta)
    }
  }

  // Get the last completed pass's decision for display
  const lastCompletedDecision = completedPasses.length > 0
    ? completedPasses[completedPasses.length - 1].decision
    : null

  return (
    <div className="surface">
      <div className="px-5 py-4">
        {/* Pass indicator — shows when on pass 2+ (hidden in compact mode) */}
        {!compact && isRevision && (
          <motion.div
            className="flex items-center gap-2 mb-3"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-medium text-accent-amber uppercase tracking-[0.12em] font-(family-name:--font-dm-mono)">
                Pass {(currentPass?.iteration ?? 0) + 1}
              </span>
              {lastCompletedDecision?.reflectionAction && (
                <span className="text-[10px] font-(family-name:--font-dm-mono)" style={{
                  color: ACTION_LABELS[lastCompletedDecision.reflectionAction]?.color ?? 'var(--color-text-muted)',
                }}>
                  — {ACTION_LABELS[lastCompletedDecision.reflectionAction]?.label}
                </span>
              )}
            </div>
            <div className="flex-1 h-px bg-border-subtle" />
            {lastCompletedDecision?.critique && (
              <button
                onClick={() => {
                  const el = document.getElementById(`critique-${currentPass?.iteration}`)
                  if (el) el.classList.toggle('hidden')
                }}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent-amber/10 border border-accent-amber/25 hover:border-accent-amber/40 hover:bg-accent-amber/15 transition-all duration-200 cursor-pointer"
              >
                <svg className="w-3 h-3 text-accent-amber" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                </svg>
                <span className="text-[10px] text-accent-amber font-medium font-(family-name:--font-dm-mono)">
                  Why?
                </span>
              </button>
            )}
          </motion.div>
        )}

        {/* Critique detail — toggled by the "Why?" pill */}
        {!compact && isRevision && lastCompletedDecision?.critique && (
          <div
            id={`critique-${currentPass?.iteration}`}
            className="hidden mb-3 px-3 py-2.5 rounded-lg bg-accent-amber/5 border border-accent-amber/15"
          >
            <div className="text-[10px] text-text-secondary font-(family-name:--font-dm-mono) leading-relaxed prose prose-invert prose-xs max-w-none [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_p]:my-1 [&_li]:my-0.5">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {lastCompletedDecision.critique}
              </ReactMarkdown>
            </div>
          </div>
        )}

        {/* Horizontal stepper */}
        <div className="flex items-center justify-between mb-1">
          {STEP_NODES.map((nodeName, idx) => {
            const { status } = nodeStatusMap[nodeName]
            const isLast = idx === STEP_NODES.length - 1

            return (
              <div key={nodeName} className="flex items-center flex-1 last:flex-none">
                {/* Node dot + label */}
                <div className="flex flex-col items-center gap-1.5">
                  <div className="relative">
                    {status === 'complete' && (
                      <motion.div
                        className="w-7 h-7 rounded-full bg-accent-emerald flex items-center justify-center"
                        initial={{ scale: 0.5 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                      >
                        <svg className="w-3.5 h-3.5 text-bg-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </motion.div>
                    )}
                    {status === 'running' && (
                      <div className="relative">
                        <div className="w-7 h-7 rounded-full bg-accent-amber flex items-center justify-center glow-amber">
                          <div className="w-2 h-2 rounded-full bg-bg-primary" />
                        </div>
                        <div className="absolute inset-0 w-7 h-7 rounded-full bg-accent-amber animate-ping opacity-20" />
                      </div>
                    )}
                    {status === 'pending' && (
                      <div className="w-7 h-7 rounded-full border border-border-default bg-bg-elevated flex items-center justify-center">
                        <div className="w-1.5 h-1.5 rounded-full bg-text-muted/40" />
                      </div>
                    )}
                  </div>
                  <span
                    className="text-[8px] sm:text-[10px] font-(family-name:--font-dm-mono) transition-colors duration-300 whitespace-nowrap"
                    style={{
                      color: status === 'running'
                        ? 'var(--color-accent-amber)'
                        : status === 'complete'
                          ? 'var(--color-text-secondary)'
                          : 'var(--color-text-muted)',
                    }}
                  >
                    {NODE_DISPLAY[nodeName].label}
                  </span>
                </div>

                {/* Connector line */}
                {!isLast && (
                  <div className="flex-1 h-px mx-2 mb-5 transition-colors duration-500" style={{
                    background: status === 'complete'
                      ? 'var(--color-accent-emerald)'
                      : 'var(--color-border-default)',
                    opacity: status === 'complete' ? 0.5 : 1,
                  }} />
                )}
              </div>
            )
          })}
        </div>

        {/* Active node detail (hidden in compact mode) */}
        <AnimatePresence mode="wait">
          {!compact && activeStep && activeDisplay && (
            <motion.div
              key={activeStep.id}
              className="mt-3 px-3 py-2.5 rounded-lg bg-bg-elevated border border-border-subtle"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2 }}
            >
              <div className="flex items-center gap-2">
                {activeStep.status === 'running' && (
                  <div className="w-1.5 h-1.5 rounded-full bg-accent-amber animate-pulse shrink-0" />
                )}
                {activeStep.status === 'complete' && (
                  <svg className="w-3 h-3 text-accent-emerald shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
                <span className="text-xs text-text-primary font-medium font-(family-name:--font-dm-sans)">
                  {activeDisplay.label}
                </span>
                {activeStep.timing_ms != null && (
                  <span className="text-[10px] text-text-muted font-(family-name:--font-dm-mono)">
                    {activeStep.timing_ms.toLocaleString()}ms
                  </span>
                )}
                {isRevision && activeStep.node === 'drafter' && (
                  <span className="text-[9px] text-accent-amber bg-accent-amber/10 px-1.5 py-0.5 rounded font-(family-name:--font-dm-mono)">
                    revision
                  </span>
                )}
              </div>
              <p className="text-[11px] text-text-muted mt-1 font-(family-name:--font-dm-mono)">
                {activeDescription}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Evaluating state (hidden in compact mode) */}
        <AnimatePresence>
          {!compact && isEvaluating && (
            <motion.div
              className="mt-3 px-3 py-2.5 rounded-lg bg-bg-elevated border border-accent-blue/20"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-accent-blue animate-pulse" />
                <span className="text-xs text-accent-blue font-medium font-(family-name:--font-dm-sans)">
                  Evaluating
                </span>
              </div>
              <p className="text-[11px] text-text-muted mt-1 font-(family-name:--font-dm-mono)">
                Scoring quality, relevance, groundedness...
              </p>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  )
}
