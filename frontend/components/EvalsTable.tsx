'use client'
import { useState, Fragment } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { EvalRun } from '@/lib/types'

interface EvalsTableProps {
  runs: EvalRun[]
}

function NodeTimingsBar({ timings }: { timings: Record<string, number> }) {
  const max = Math.max(...Object.values(timings), 1)
  return (
    <div className="space-y-1.5 py-2">
      {Object.entries(timings).map(([node, ms], i) => (
        <div key={node} className="flex items-center gap-3">
          <span className="font-(family-name:--font-dm-mono) text-[11px] text-text-muted w-24 shrink-0">{node}</span>
          <div className="flex-1 h-2 bg-bg-elevated rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-accent-amber rounded-full opacity-70"
              initial={{ width: 0 }}
              animate={{ width: `${(ms / max) * 100}%` }}
              transition={{ duration: 0.5, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
          <span className="font-(family-name:--font-dm-mono) text-[11px] text-text-secondary w-16 text-right">{ms.toLocaleString()}ms</span>
        </div>
      ))}
    </div>
  )
}

export default function EvalsTable({ runs }: EvalsTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (runs.length === 0) {
    return (
      <div className="surface p-8 flex items-center justify-center">
        <p className="text-sm text-text-muted font-(family-name:--font-dm-mono)">No evaluation runs recorded yet.</p>
      </div>
    )
  }

  const thClass = "text-left px-3 py-3 text-[10px] font-medium text-text-muted uppercase tracking-[0.15em] font-(family-name:--font-dm-mono)"
  const thRightClass = "text-right px-3 py-3 text-[10px] font-medium text-text-muted uppercase tracking-[0.15em] font-(family-name:--font-dm-mono)"

  return (
    <div className="surface overflow-hidden">
      <div className="px-5 py-4 border-b border-border-subtle">
        <h2 className="text-[11px] font-medium text-text-muted uppercase tracking-[0.2em] font-(family-name:--font-dm-mono)">
          Run History
        </h2>
      </div>

      <div className="overflow-auto max-h-[480px]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-bg-surface z-10">
            <tr className="border-b border-border-subtle">
              <th className={`${thClass} pl-5`}>Topic</th>
              <th className={thClass}>Date</th>
              <th className={thRightClass}>Quality</th>
              <th className={thRightClass}>Relevance</th>
              <th className={thRightClass}>Grounded</th>
              <th className={thRightClass}>Tokens</th>
              <th className={thRightClass}>Cost</th>
              <th className={`${thRightClass} pr-5`}>Latency</th>
            </tr>
          </thead>
          <tbody>
            {runs.map(run => {
              const isExpanded = expandedId === run.id
              let timings: Record<string, number> = {}
              try { timings = JSON.parse(run.node_timings) } catch {}
              return (
                <Fragment key={run.id}>
                  <tr
                    className="border-b border-border-subtle/50 hover:bg-bg-elevated/50 cursor-pointer transition-colors duration-200"
                    onClick={() => setExpandedId(isExpanded ? null : run.id)}
                  >
                    <td className="pl-5 px-3 py-3 text-text-primary max-w-[200px] truncate text-sm font-(family-name:--font-dm-sans)">{run.topic}</td>
                    <td className="px-3 py-3 text-text-muted font-(family-name:--font-dm-mono) text-xs">
                      {new Date(run.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-3 py-3 text-right font-(family-name:--font-dm-mono) text-xs text-accent-emerald">{run.quality?.toFixed(1)}</td>
                    <td className="px-3 py-3 text-right font-(family-name:--font-dm-mono) text-xs text-accent-amber">{run.relevance?.toFixed(1)}</td>
                    <td className="px-3 py-3 text-right font-(family-name:--font-dm-mono) text-xs text-accent-blue">{run.groundedness?.toFixed(1)}</td>
                    <td className="px-3 py-3 text-right font-(family-name:--font-dm-mono) text-xs text-text-secondary">{run.total_tokens?.toLocaleString()}</td>
                    <td className="px-3 py-3 text-right font-(family-name:--font-dm-mono) text-xs text-text-secondary">${run.estimated_cost_usd?.toFixed(4)}</td>
                    <td className="pr-5 px-3 py-3 text-right font-(family-name:--font-dm-mono) text-xs text-text-secondary">{((run.latency_ms ?? 0) / 1000).toFixed(1)}s</td>
                  </tr>
                  <AnimatePresence>
                    {isExpanded && Object.keys(timings).length > 0 && (
                      <tr>
                        <td colSpan={8}>
                          <motion.div
                            className="px-5 py-3 bg-bg-elevated/30"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                          >
                            <p className="text-[10px] text-text-muted mb-1.5 font-medium uppercase tracking-wider font-(family-name:--font-dm-mono)">Per-node latency</p>
                            <NodeTimingsBar timings={timings} />
                          </motion.div>
                        </td>
                      </tr>
                    )}
                  </AnimatePresence>
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
