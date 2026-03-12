'use client'
import { motion, AnimatePresence } from 'motion/react'
import { TraceNode, NodeName } from '@/lib/types'

const NODE_ORDER: NodeName[] = ['planner', 'searcher', 'summariser', 'drafter', 'reflection']

const NODE_META: Record<NodeName, { label: string; description: string; icon: string }> = {
  planner:    { label: 'Planner',    description: 'Breaking topic into queries', icon: '01' },
  searcher:   { label: 'Searcher',   description: 'Searching via Tavily',       icon: '02' },
  summariser: { label: 'Summariser', description: 'Condensing sources',          icon: '03' },
  drafter:    { label: 'Drafter',    description: 'Writing article',             icon: '04' },
  reflection: { label: 'Reflection', description: 'Critiquing output',           icon: '05' },
}

interface TracePanelProps {
  nodes: TraceNode[]
  isEvaluating: boolean
}

export default function TracePanel({ nodes, isEvaluating }: TracePanelProps) {
  return (
    <div className="surface flex-1 min-h-0 flex flex-col">
      <div className="px-5 py-3 border-b border-border-subtle">
        <h2 className="text-[11px] font-medium text-text-muted uppercase tracking-[0.2em] font-(family-name:--font-dm-mono)">
          Pipeline
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-3">
        <div className="relative">
          {NODE_ORDER.map((nodeName, idx) => {
            const node = nodes.find(n => n.name === nodeName)
            const status = node?.status ?? 'pending'
            const isLast = idx === NODE_ORDER.length - 1 && !isEvaluating
            const meta = NODE_META[nodeName]

            return (
              <motion.div
                key={nodeName}
                className="relative flex items-start gap-3 pb-5"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: idx * 0.05 }}
              >
                {/* Connector line */}
                {!isLast && (
                  <div
                    className="absolute left-[13px] top-[30px] w-px h-full transition-colors duration-500"
                    style={{
                      background: status === 'complete'
                        ? 'var(--color-accent-emerald)'
                        : 'var(--color-border-default)',
                      opacity: status === 'complete' ? 0.4 : 1,
                    }}
                  />
                )}

                {/* Status indicator */}
                <div className="relative z-10 shrink-0 mt-0.5">
                  {status === 'pending' && (
                    <div className="w-[26px] h-[26px] rounded-full border border-border-default bg-bg-elevated flex items-center justify-center">
                      <span className="text-[8px] font-(family-name:--font-dm-mono) text-text-muted">
                        {meta.icon}
                      </span>
                    </div>
                  )}
                  {status === 'running' && (
                    <div className="relative">
                      <div className="w-[26px] h-[26px] rounded-full bg-accent-amber flex items-center justify-center glow-amber">
                        <span className="text-[8px] font-(family-name:--font-dm-mono) text-bg-primary font-medium">
                          {meta.icon}
                        </span>
                      </div>
                      <div className="absolute inset-0 w-[26px] h-[26px] rounded-full bg-accent-amber animate-ping opacity-20" />
                    </div>
                  )}
                  {status === 'complete' && (
                    <motion.div
                      className="w-[26px] h-[26px] rounded-full bg-accent-emerald flex items-center justify-center glow-emerald"
                      initial={{ scale: 0.5 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                    >
                      <svg className="w-3 h-3 text-bg-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </motion.div>
                  )}
                </div>

                {/* Node info */}
                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="text-sm font-medium font-(family-name:--font-dm-sans) transition-colors duration-300"
                      style={{
                        color: status === 'complete'
                          ? 'var(--color-text-primary)'
                          : status === 'running'
                            ? 'var(--color-accent-amber)'
                            : 'var(--color-text-muted)',
                      }}
                    >
                      {meta.label}
                    </span>
                    <AnimatePresence>
                      {node?.timing_ms != null && (
                        <motion.span
                          className="text-[10px] text-text-muted bg-bg-elevated px-2 py-0.5 rounded font-(family-name:--font-dm-mono)"
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ duration: 0.2 }}
                        >
                          {node.timing_ms.toLocaleString()}ms
                        </motion.span>
                      )}
                    </AnimatePresence>
                    {(node?.iteration ?? 0) > 1 && (
                      <span className="text-[10px] text-accent-amber bg-accent-amber-dim px-2 py-0.5 rounded font-(family-name:--font-dm-mono)">
                        loop {node!.iteration}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-text-muted mt-0.5 font-(family-name:--font-dm-mono)">
                    {status === 'running'
                      ? meta.description + '...'
                      : meta.description
                    }
                  </p>
                </div>
              </motion.div>
            )
          })}

          {/* Evaluating row */}
          <AnimatePresence>
            {isEvaluating && (
              <motion.div
                className="relative flex items-start gap-3 pb-3"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
              >
                <div className="relative z-10 shrink-0 mt-0.5">
                  <div className="relative">
                    <div className="w-[26px] h-[26px] rounded-full bg-accent-blue flex items-center justify-center shadow-[0_0_16px_rgba(96,165,250,0.3)]">
                      <span className="text-[8px] font-(family-name:--font-dm-mono) text-bg-primary font-medium">
                        E
                      </span>
                    </div>
                    <div className="absolute inset-0 w-[26px] h-[26px] rounded-full bg-accent-blue animate-ping opacity-20" />
                  </div>
                </div>
                <div className="flex-1 pt-0.5">
                  <span className="text-sm font-medium text-accent-blue font-(family-name:--font-dm-sans)">
                    Evaluating
                  </span>
                  <p className="text-[11px] text-text-muted mt-0.5 font-(family-name:--font-dm-mono)">
                    Scoring quality, relevance, groundedness...
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
