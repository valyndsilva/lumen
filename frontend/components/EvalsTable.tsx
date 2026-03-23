'use client'
import { useState, Fragment } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { EvalRun } from '@/lib/types'
import { fetchRun } from '@/lib/api'
import type { SavedRun } from '@/lib/api'

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
  const [viewingRun, setViewingRun] = useState<SavedRun | null>(null)
  const [loadingArticle, setLoadingArticle] = useState<string | null>(null)

  const handleView = async (e: React.MouseEvent, runId: string) => {
    e.stopPropagation()
    setLoadingArticle(runId)
    try {
      const run = await fetchRun(runId)
      setViewingRun(run)
    } catch (err) {
      console.error('Failed to load article:', err)
    } finally {
      setLoadingArticle(null)
    }
  }

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
              <th className={thRightClass}>Evidence</th>
              <th className={thRightClass}>Tokens</th>
              <th className={thRightClass}>Cost</th>
              <th className={thRightClass}>Latency</th>
              <th className={`${thRightClass} pr-5`}></th>
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
                    <td className="px-3 py-3 text-right">
                      {run.evidence_strength && (
                        <span className={`text-[10px] font-(family-name:--font-dm-mono) font-medium capitalize ${
                          run.evidence_strength === 'high' ? 'text-accent-emerald' :
                          run.evidence_strength === 'medium' ? 'text-accent-amber' :
                          'text-red-400'
                        }`}>{run.evidence_strength}</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right font-(family-name:--font-dm-mono) text-xs text-text-secondary">{run.total_tokens?.toLocaleString()}</td>
                    <td className="px-3 py-3 text-right font-(family-name:--font-dm-mono) text-xs text-text-secondary">${run.estimated_cost_usd?.toFixed(4)}</td>
                    <td className="px-3 py-3 text-right font-(family-name:--font-dm-mono) text-xs text-text-secondary">{((run.latency_ms ?? 0) / 1000).toFixed(1)}s</td>
                    <td className="pr-5 px-3 py-3 text-right">
                      <button
                        onClick={(e) => handleView(e, run.id)}
                        disabled={loadingArticle === run.id}
                        className="text-[10px] text-accent-amber hover:text-text-primary bg-accent-amber/10 hover:bg-accent-amber/20 px-2.5 py-1 rounded-md transition-all duration-200 font-(family-name:--font-dm-mono) disabled:opacity-40"
                      >
                        {loadingArticle === run.id ? '...' : 'View'}
                      </button>
                    </td>
                  </tr>
                  <AnimatePresence>
                    {isExpanded && Object.keys(timings).length > 0 && (
                      <tr>
                        <td colSpan={10}>
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

      {/* Article viewer modal */}
      <AnimatePresence>
        {viewingRun && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setViewingRun(null)}
          >
            <motion.div
              className="surface w-full max-w-3xl mx-4 max-h-[85vh] flex flex-col"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-5 py-4 border-b border-border-subtle flex items-center justify-between shrink-0">
                <div>
                  <h2 className="text-sm font-semibold text-text-primary font-(family-name:--font-dm-sans)">
                    {viewingRun.topic}
                  </h2>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-[10px] text-text-muted font-(family-name:--font-dm-mono)">
                      {new Date(viewingRun.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {viewingRun.quality != null && (
                      <span className="text-[10px] font-(family-name:--font-dm-mono) text-accent-emerald">
                        Q {viewingRun.quality.toFixed(1)}
                      </span>
                    )}
                    {viewingRun.relevance != null && (
                      <span className="text-[10px] font-(family-name:--font-dm-mono) text-accent-amber">
                        R {viewingRun.relevance.toFixed(1)}
                      </span>
                    )}
                    {viewingRun.groundedness != null && (
                      <span className="text-[10px] font-(family-name:--font-dm-mono) text-accent-blue">
                        G {viewingRun.groundedness.toFixed(1)}
                      </span>
                    )}
                    {viewingRun.evidence_strength && (
                      <span className={`text-[10px] font-(family-name:--font-dm-mono) font-medium px-1.5 py-0.5 rounded ${
                        viewingRun.evidence_strength === 'high' ? 'bg-accent-emerald/10 text-accent-emerald' :
                        viewingRun.evidence_strength === 'medium' ? 'bg-accent-amber/10 text-accent-amber' :
                        'bg-red-500/10 text-red-400'
                      }`}>
                        {viewingRun.evidence_strength} evidence
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setViewingRun(null)}
                  className="text-text-muted hover:text-text-primary transition-colors p-1"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-4">
                <div className="prose-lumen">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {viewingRun.draft.replace(/\n##\s+Sources\s*\n[\s\S]*$/, '')}
                  </ReactMarkdown>
                </div>

                {/* Sources */}
                {(() => {
                  let urls: string[] = []
                  try {
                    const parsed = JSON.parse(viewingRun.sources || '[]')
                    urls = Array.isArray(parsed) ? parsed : []
                  } catch {}
                  if (urls.length === 0) return null
                  return (
                    <div className="mt-8 pt-5 border-t border-border-subtle">
                      <h3 className="text-[11px] font-medium text-text-muted uppercase tracking-[0.2em] mb-3 font-(family-name:--font-dm-mono)">
                        Sources
                      </h3>
                      <ol className="space-y-2">
                        {[...new Set(urls)].map((url, i) => (
                          <li key={i} className="flex items-start gap-2.5">
                            <span className="font-(family-name:--font-dm-mono) text-[10px] text-text-muted mt-0.5 shrink-0 w-4 text-right">
                              {i + 1}
                            </span>
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-accent-amber hover:text-text-primary break-all transition-colors duration-200 border-b border-transparent hover:border-accent-amber font-(family-name:--font-dm-mono)"
                            >
                              {url}
                            </a>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )
                })()}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
