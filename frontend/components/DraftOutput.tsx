'use client'
import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { EvalScores } from '@/lib/types'

interface DraftOutputProps {
  draft: string
  sources: string[]
  scores?: EvalScores
  onRefine?: () => void
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

  const draftWithoutSources = draft.replace(/\n##\s+Sources\s*\n[\s\S]*$/, '')

  const handleCopy = async () => {
    await navigator.clipboard.writeText(draft)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
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
          {refineExpired ? (
            <span className="text-[10px] text-text-muted font-(family-name:--font-dm-mono)">
              Session expired
            </span>
          ) : onRefine && (
            <button
              onClick={onRefine}
              disabled={isRefining}
              className="text-[10px] text-accent-amber hover:text-text-primary bg-accent-amber-dim hover:bg-accent-amber/20 px-2.5 py-1 rounded-md transition-all duration-200 font-(family-name:--font-dm-mono) disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isRefining ? 'Refining...' : 'Dig Deeper'}
            </button>
          )}
          <button
            onClick={handleCopy}
            className="text-[10px] text-text-muted hover:text-text-primary bg-bg-elevated hover:bg-border-subtle px-2.5 py-1 rounded-md transition-all duration-200 font-(family-name:--font-dm-mono)"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

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
              {[...new Set(sources)].map((url, i) => (
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
        )}
      </div>
    </div>
  )
}
