'use client'
import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { EvalScores } from '@/lib/types'

interface DraftOutputProps {
  draft: string
  sources: string[]
  scores?: EvalScores
  onRefine?: (instructions?: string) => void
  isRefining?: boolean
  refineExpired?: boolean
}

function ScoreBadge({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-bg-elevated border border-border-subtle">
      <div className={`w-1.5 h-1.5 rounded-full ${color}`} />
      <span className="text-[10px] text-text-muted font-(family-name:--font-dm-mono)">{label}</span>
      <span className="text-[10px] text-text-primary font-medium font-(family-name:--font-dm-mono)">{value.toFixed(1)}<span className="text-text-muted">/5</span></span>
    </div>
  )
}

export default function DraftOutput({ draft, sources, scores, onRefine, isRefining, refineExpired }: DraftOutputProps) {
  const [copied, setCopied] = useState(false)
  const [refineInput, setRefineInput] = useState('')

  const draftWithoutSources = draft.replace(/\n##\s+Sources\s*\n[\s\S]*$/, '')

  const handleCopy = async () => {
    await navigator.clipboard.writeText(draft)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleRefineSubmit = () => {
    if (!onRefine || isRefining) return
    const instructions = refineInput.trim() || undefined
    onRefine(instructions)
    setRefineInput('')
  }

  return (
    <div className="surface h-full flex flex-col">
      {/* Header bar: scores + actions in one row */}
      <div className="px-5 py-3 border-b border-border-subtle flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {scores && (
            <>
              <span className="text-[9px] text-text-muted uppercase tracking-wider font-(family-name:--font-dm-mono) mr-1">Scores</span>
              <ScoreBadge label="Quality" value={scores.quality} color="bg-accent-emerald" />
              <ScoreBadge label="Relevance" value={scores.relevance} color="bg-accent-amber" />
              <ScoreBadge label="Grounded" value={scores.groundedness} color="bg-accent-blue" />
              {scores.evidence_strength && (
                <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md border ${
                  scores.evidence_strength === 'high' ? 'bg-accent-emerald/10 border-accent-emerald/30 text-accent-emerald' :
                  scores.evidence_strength === 'medium' ? 'bg-accent-amber/10 border-accent-amber/30 text-accent-amber' :
                  'bg-red-500/10 border-red-500/30 text-red-400'
                }`}>
                  <span className="text-[10px] font-medium font-(family-name:--font-dm-mono) capitalize">{scores.evidence_strength} Evidence</span>
                </div>
              )}
              {scores.source_eval && scores.source_eval.total_sources > 0 && (
                <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md border ${
                  scores.source_eval.trusted_ratio >= 0.8 ? 'bg-accent-emerald/10 border-accent-emerald/30 text-accent-emerald' :
                  scores.source_eval.trusted_ratio >= 0.5 ? 'bg-accent-amber/10 border-accent-amber/30 text-accent-amber' :
                  'bg-red-500/10 border-red-500/30 text-red-400'
                }`}>
                  <span className="text-[10px] font-medium font-(family-name:--font-dm-mono)">
                    {scores.source_eval.trusted_sources}/{scores.source_eval.total_sources} Trusted Sources
                  </span>
                </div>
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="text-[10px] text-text-muted hover:text-text-primary bg-bg-elevated hover:bg-border-subtle px-2.5 py-1 rounded-md transition-all duration-200 font-(family-name:--font-dm-mono)"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      {/* Refinement input bar */}
      {!refineExpired && onRefine && (
        <div className="px-5 py-2.5 border-b border-border-subtle flex items-center gap-2">
          <input
            type="text"
            value={refineInput}
            onChange={(e) => setRefineInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleRefineSubmit() } }}
            placeholder="Refine this article... (e.g. &quot;Expand the limitations section&quot;)"
            disabled={isRefining}
            maxLength={1000}
            className="flex-1 bg-bg-elevated border border-border-subtle rounded-md px-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted/50 font-(family-name:--font-dm-mono) focus:outline-none focus:border-accent-amber/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          />
          <button
            onClick={handleRefineSubmit}
            disabled={isRefining}
            className="text-[10px] text-accent-amber hover:text-text-primary bg-accent-amber-dim hover:bg-accent-amber/20 px-3 py-1.5 rounded-md transition-all duration-200 font-(family-name:--font-dm-mono) disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {isRefining ? 'Refining...' : refineInput.trim() ? 'Refine' : 'Dig Deeper'}
          </button>
        </div>
      )}
      {refineExpired && (
        <div className="px-5 py-2 border-b border-border-subtle">
          <span className="text-[10px] text-text-muted font-(family-name:--font-dm-mono)">
            Session expired — start a new research to refine
          </span>
        </div>
      )}

      {/* Article content */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="prose-lumen">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {draftWithoutSources}
          </ReactMarkdown>
        </div>

        {/* Sources */}
        {sources.length > 0 && (
          <div className="mt-8 pt-5 border-t border-border-subtle">
            <h3 className="text-[11px] font-medium text-text-muted uppercase tracking-[0.2em] mb-3 font-(family-name:--font-dm-mono)">
              Sources
            </h3>
            <ol className="space-y-2">
              {(() => {
                const unique = [...new Set(sources)]
                const docUrls = unique.filter(u => u.startsWith('doc://'))
                const webUrls = unique.filter(u => !u.startsWith('doc://'))

                // For doc:// sources, group them into a single entry per document
                const docGroups = new Map<string, number>()
                for (const url of docUrls) {
                  const docId = url.replace('doc://', '').split('#')[0]
                  docGroups.set(docId, (docGroups.get(docId) ?? 0) + 1)
                }

                const items: React.ReactNode[] = []
                let idx = 0

                // Render grouped document sources
                docGroups.forEach((passageCount, _docId) => {
                  idx++
                  items.push(
                    <li key={`doc-${_docId}`} className="flex items-start gap-2.5">
                      <span className="font-(family-name:--font-dm-mono) text-[10px] text-text-muted mt-0.5 shrink-0 w-4 text-right">
                        {idx}
                      </span>
                      <span className="text-xs text-text-secondary font-(family-name:--font-dm-mono) flex items-center gap-1.5">
                        <svg className="w-3 h-3 text-accent-amber shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Your uploaded document — {passageCount} {passageCount === 1 ? 'passage' : 'passages'} referenced
                      </span>
                    </li>
                  )
                })

                // Render web sources
                for (const url of webUrls) {
                  idx++
                  items.push(
                    <li key={url} className="flex items-start gap-2.5">
                      <span className="font-(family-name:--font-dm-mono) text-[10px] text-text-muted mt-0.5 shrink-0 w-4 text-right">
                        {idx}
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
                  )
                }

                return items
              })()}
            </ol>
          </div>
        )}
      </div>
    </div>
  )
}
