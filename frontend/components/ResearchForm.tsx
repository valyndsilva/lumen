'use client'
import { useState } from 'react'
import { motion } from 'motion/react'
import { NodeName } from '@/lib/types'

const NODE_LABELS: Record<NodeName, string> = {
  planner: 'Planning queries',
  searcher: 'Searching web',
  summariser: 'Summarising',
  drafter: 'Writing draft',
  reflection: 'Reflecting',
}

const SUGGESTED_TOPICS = [
  { label: 'AI Agents 2026', topic: 'AI agents in software development 2026' },
  { label: 'RAG in Production', topic: 'How does RAG work in production systems' },
  { label: 'LLMs & Junior Devs', topic: 'The impact of LLMs on junior developer hiring and career paths' },
  { label: 'Open Source AI', topic: 'Why open source AI models are challenging proprietary ones' },
  { label: 'Remote Work', topic: 'Remote work culture and its effect on software team productivity' },
  { label: 'Edge Computing', topic: 'The rise of edge computing and its impact on cloud architecture' },
  { label: 'Browser IDEs', topic: 'The future of browser-based development environments' },
  { label: 'AI in Healthcare', topic: 'How AI is transforming healthcare diagnostics in 2026' },
]

interface ResearchFormProps {
  onSubmit: (topic: string) => void
  isRunning: boolean
  currentNode: NodeName | null
  isEvaluating: boolean
}

export default function ResearchForm({ onSubmit, isRunning, currentNode, isEvaluating }: ResearchFormProps) {
  const [topic, setTopic] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (topic.trim() && !isRunning) {
      onSubmit(topic.trim())
    }
  }

  const statusText = isEvaluating
    ? 'Evaluating quality...'
    : currentNode
      ? NODE_LABELS[currentNode]
      : null

  return (
    <div className="surface flex flex-col">
      <div className="px-5 py-3 border-b border-border-subtle">
        <h2 className="text-[11px] font-medium text-text-muted uppercase tracking-[0.2em] font-(family-name:--font-dm-mono)">
          Research
        </h2>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col p-4">
        <textarea
          id="topic"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g. The impact of AI agents on software development in 2026"
          disabled={isRunning}
          className="min-h-[80px] max-h-[120px] w-full bg-bg-elevated border border-border-default rounded-lg px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-amber/40 focus:border-accent-amber/40 resize-none disabled:opacity-40 transition-all duration-300 font-(family-name:--font-dm-sans)"
        />

        {!isRunning && !topic.trim() && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {SUGGESTED_TOPICS.map(({ label, topic: t }) => (
              <button
                key={t}
                type="button"
                onClick={() => { setTopic(t); onSubmit(t) }}
                className="text-[10px] px-2.5 py-1 rounded-md bg-bg-elevated border border-border-subtle text-text-secondary hover:text-accent-amber hover:border-accent-amber/30 transition-all duration-200 font-(family-name:--font-dm-mono)"
              >
                {label}
              </button>
            ))}
          </div>
        )}

        <button
          type="submit"
          disabled={isRunning || !topic.trim()}
          className="shrink-0 group mt-4 w-full relative overflow-hidden rounded-lg text-sm font-medium py-3 px-6 transition-all duration-300 disabled:opacity-30 disabled:cursor-not-allowed bg-accent-amber text-bg-primary hover:shadow-[0_0_24px_rgba(226,164,59,0.25)] font-(family-name:--font-dm-sans)"
        >
          <span className="relative z-10">
            {isRunning ? 'Researching...' : 'Research'}
          </span>
        </button>

        {statusText && (
          <motion.div
            className="mt-3 flex items-center gap-2"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="w-1.5 h-1.5 rounded-full bg-accent-amber animate-pulse" />
            <span className="text-[11px] text-text-secondary font-(family-name:--font-dm-mono)">
              {statusText}
            </span>
          </motion.div>
        )}
      </form>
    </div>
  )
}
