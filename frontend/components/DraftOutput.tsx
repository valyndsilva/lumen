'use client'
import { useState } from 'react'
import { motion } from 'motion/react'
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

function ScoreBar({ label, value, color, delay }: { label: string; value: number; color: string; delay: number }) {
  const pct = (value / 5) * 100
  return (
    <div className="flex items-center gap-3">
      <span className="text-[11px] text-text-muted w-24 shrink-0 font-(family-name:--font-dm-mono) uppercase tracking-wider">
        {label}
      </span>
      <div className="flex-1 h-1.5 bg-bg-elevated rounded-full overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${color}`}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, delay, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
      <span className="font-(family-name:--font-dm-mono) text-[11px] text-text-primary w-8 text-right">
        {value.toFixed(1)}
      </span>
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
      {/* Scores */}
      {scores && (
        <div className="px-5 py-4 border-b border-border-subtle">
          <h3 className="text-[11px] font-medium text-text-muted uppercase tracking-[0.2em] mb-3 font-(family-name:--font-dm-mono)">
            Scores
          </h3>
          <div className="space-y-2.5">
            <ScoreBar label="Quality" value={scores.quality} color="bg-accent-emerald" delay={0} />
            <ScoreBar label="Relevance" value={scores.relevance} color="bg-accent-amber" delay={0.1} />
            <ScoreBar label="Grounded" value={scores.groundedness} color="bg-accent-blue" delay={0.2} />
          </div>
        </div>
      )}

      {/* Draft content */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-[11px] font-medium text-text-muted uppercase tracking-[0.2em] font-(family-name:--font-dm-mono)">
            Article
          </h2>
          <div className="flex items-center gap-2">
            {refineExpired ? (
              <span className="text-[11px] text-text-muted font-(family-name:--font-dm-mono)">
                Session expired
              </span>
            ) : onRefine && (
              <button
                onClick={onRefine}
                disabled={isRefining}
                className="text-[11px] text-accent-amber hover:text-text-primary bg-accent-amber-dim hover:bg-accent-amber/20 px-3 py-1.5 rounded-md transition-all duration-200 font-(family-name:--font-dm-mono) disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isRefining ? 'Refining...' : 'Dig Deeper'}
              </button>
            )}
            <button
              onClick={handleCopy}
              className="text-[11px] text-text-muted hover:text-text-primary bg-bg-elevated hover:bg-border-subtle px-3 py-1.5 rounded-md transition-all duration-200 font-(family-name:--font-dm-mono)"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>

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
