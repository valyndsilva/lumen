'use client'
import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import ReactMarkdown from 'react-markdown'
import type { TraceStep, NodeName } from '@/lib/types'

function ExpandableText({ text, className = '' }: { text: string; className?: string }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div
      className={`cursor-pointer group ${className}`}
      onClick={() => setExpanded(!expanded)}
    >
      <div className={`text-[10px] text-text-muted font-(family-name:--font-dm-mono) leading-relaxed [&_strong]:text-text-secondary [&_strong]:font-medium [&_p]:mb-1 [&_ol]:pl-4 [&_li]:mb-0.5 ${expanded ? '' : 'line-clamp-3'}`}>
        <ReactMarkdown>{text}</ReactMarkdown>
      </div>
      <span className="text-[9px] text-text-muted/60 group-hover:text-accent-amber font-(family-name:--font-dm-mono) transition-colors">
        {expanded ? 'Show less' : 'Show more'}
      </span>
    </div>
  )
}

interface ActivityFeedProps {
  steps: TraceStep[]
  isEvaluating: boolean
  error?: string | null
}

interface FeedEntry {
  id: string
  icon: 'planner' | 'searcher' | 'summariser' | 'outliner' | 'drafter' | 'reflection' | 'evaluating'
  color: string
  title: string
  detail?: string
  items?: { label: string; sub?: string }[]
  iteration: number
  isDecision?: boolean
}

interface FeedGroup {
  iteration: number
  entries: FeedEntry[]
  decision?: FeedEntry  // the reflection decision for this pass
}

function FeedIcon({ icon, color }: { icon: FeedEntry['icon']; color: string }) {
  const cls = "w-3.5 h-3.5"
  const style = { color }

  switch (icon) {
    case 'planner':
      return (
        <svg className={cls} style={style} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      )
    case 'searcher':
      return (
        <svg className={cls} style={style} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
        </svg>
      )
    case 'summariser':
      return (
        <svg className={cls} style={style} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
      )
    case 'outliner':
      return (
        <svg className={cls} style={style} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm0 5.25h.007v.008H3.75V12zm0 5.25h.007v.008H3.75v-.008z" />
        </svg>
      )
    case 'drafter':
      return (
        <svg className={cls} style={style} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
        </svg>
      )
    case 'reflection':
      return (
        <svg className={cls} style={style} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      )
    case 'evaluating':
      return (
        <svg className={cls} style={style} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
        </svg>
      )
  }
}

function buildEntries(steps: TraceStep[]): FeedEntry[] {
  const entries: FeedEntry[] = []

  // Process all steps in order — nodes and reflection decisions interleaved
  for (const step of steps) {
    // --- Reflection decisions ---
    if (step.type === 'reflection_decision') {
      const action = step.reflectionAction
      const actionLabel = action === 'accept' ? 'Accepted'
        : action === 'revise' ? 'Revising draft'
        : action === 'research' ? 'Researching more'
        : ''
      const actionColor = action === 'accept' ? 'var(--color-accent-emerald)'
        : action === 'research' ? 'var(--color-accent-blue)'
        : 'var(--color-accent-amber)'

      entries.push({
        id: step.id,
        icon: 'reflection',
        color: actionColor,
        title: `Reflection — ${actionLabel}`,
        detail: step.critique || undefined,
        iteration: step.iteration,
        isDecision: true,
      })
      continue
    }

    // --- Node steps ---
    if (step.type !== 'node' || step.status !== 'complete' || !step.node) continue

    const meta = step.meta as Record<string, unknown> | undefined
    const timing = step.timing_ms ? `${step.timing_ms.toLocaleString()}ms` : ''
    const isLoop = step.iteration > 0

    switch (step.node) {
      case 'planner': {
        const n = meta?.queries as number | undefined
        const preview = meta?.preview as string[] | undefined
        entries.push({
          id: step.id,
          icon: 'planner',
          color: 'var(--color-accent-amber)',
          title: `Planner · ${n ?? 0} queries ${timing ? `· ${timing}` : ''}`,
          detail: 'Generated search queries:',
          items: preview?.map(q => ({ label: q })),
          iteration: step.iteration,
        })
        break
      }
      case 'searcher': {
        const n = meta?.sources as number | undefined
        const preview = meta?.preview as { title: string; url: string }[] | undefined
        entries.push({
          id: step.id,
          icon: 'searcher',
          color: 'var(--color-accent-blue)',
          title: `Searcher · ${n ?? 0} ${isLoop ? 'new ' : ''}sources ${timing ? `· ${timing}` : ''}`,
          detail: isLoop ? 'Found additional sources to fill content gaps:' : 'Retrieved sources from the web:',
          items: preview?.map(s => ({ label: s.title, sub: s.url })),
          iteration: step.iteration,
        })
        break
      }
      case 'summariser': {
        const n = meta?.summaries as number | undefined
        entries.push({
          id: step.id,
          icon: 'summariser',
          color: 'var(--color-accent-emerald)',
          title: `Summariser · ${n ?? 0} sources ${timing ? `· ${timing}` : ''}`,
          detail: isLoop
            ? 'Extracted key facts from new sources and added to research pool.'
            : 'Extracted key facts and citations from each source.',
          iteration: step.iteration,
        })
        break
      }
      case 'outliner': {
        const preview = meta?.preview as string | undefined
        entries.push({
          id: step.id,
          icon: 'outliner',
          color: 'var(--color-accent-amber)',
          title: `Outliner · ${meta?.sections ?? 0} sections ${timing ? `· ${timing}` : ''}`,
          detail: preview || 'Planned article structure with source assignments.',
          iteration: step.iteration,
        })
        break
      }
      case 'drafter': {
        const n = meta?.words as number | undefined
        entries.push({
          id: step.id,
          icon: 'drafter',
          color: 'var(--color-accent-amber)',
          title: `Drafter · ${n?.toLocaleString() ?? 0} words ${timing ? `· ${timing}` : ''}`,
          detail: isLoop
            ? 'Revised the article incorporating feedback and new research.'
            : 'Wrote a structured article following the outline.',
          iteration: step.iteration,
        })
        break
      }
      case 'reflection': {
        break
      }
    }
  }

  return entries
}

function groupEntries(entries: FeedEntry[]): FeedGroup[] {
  const groups: FeedGroup[] = []
  const groupMap = new Map<number, FeedGroup>()

  for (const entry of entries) {
    if (!groupMap.has(entry.iteration)) {
      const group: FeedGroup = { iteration: entry.iteration, entries: [] }
      groupMap.set(entry.iteration, group)
      groups.push(group)
    }
    const group = groupMap.get(entry.iteration)!
    if (entry.isDecision) {
      group.decision = entry
    } else {
      group.entries.push(entry)
    }
  }

  return groups
}

function EntryRow({ entry }: { entry: FeedEntry }) {
  return (
    <motion.div
      className="mb-3 last:mb-0"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5"
          style={{
            background: `color-mix(in srgb, ${entry.color} 15%, transparent)`,
            border: `1px solid color-mix(in srgb, ${entry.color} 30%, transparent)`,
          }}
        >
          <FeedIcon icon={entry.icon} color={entry.color} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-text-primary font-(family-name:--font-dm-sans)">
            {entry.title}
          </p>
          {entry.detail && (
            <p className="text-[11px] text-text-muted mt-1 font-(family-name:--font-dm-mono) leading-relaxed whitespace-pre-line line-clamp-4">
              {entry.detail}
            </p>
          )}
          {entry.items && entry.items.length > 0 && (
            <div className="mt-1.5 space-y-1">
              {entry.items.map((item, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-[10px] text-text-muted shrink-0 mt-px">›</span>
                  <div className="min-w-0">
                    <p className="text-[11px] text-text-secondary font-(family-name:--font-dm-mono) truncate">
                      {item.label}
                    </p>
                    {item.sub && (
                      <p className="text-[10px] text-text-muted font-(family-name:--font-dm-mono) truncate">
                        {item.sub}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}

export default function ActivityFeed({ steps, isEvaluating, error }: ActivityFeedProps) {
  const entries = buildEntries(steps)
  const groups = groupEntries(entries)
  const scrollRef = useRef<HTMLDivElement>(null)
  const totalSteps = entries.filter(e => !e.isDecision).length

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [entries.length])

  return (
    <div className="surface h-full flex flex-col">
      <div className="px-5 py-3 border-b border-border-subtle flex items-center justify-between">
        <h2 className="text-[11px] font-medium text-text-muted uppercase tracking-[0.2em] font-(family-name:--font-dm-mono)">
          Activity
        </h2>
        {totalSteps > 0 && (
          <span className="text-[10px] text-text-muted font-(family-name:--font-dm-mono)">
            {groups.length} {groups.length === 1 ? 'pass' : 'passes'} · {totalSteps} steps
          </span>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4">
        {entries.length === 0 && !isEvaluating && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="flex justify-center mb-3">
                <div className="flex gap-1">
                  {[0, 1, 2].map(i => (
                    <motion.div
                      key={i}
                      className="w-1.5 h-1.5 rounded-full bg-accent-amber"
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                    />
                  ))}
                </div>
              </div>
              <p className="text-xs text-text-muted font-(family-name:--font-dm-sans)">
                Pipeline starting...
              </p>
            </div>
          </div>
        )}

        <AnimatePresence initial={false}>
          {groups.map((group, groupIdx) => (
            <motion.div
              key={`group-${group.iteration}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
            >
              {/* Pass header — show for all passes when there are multiple */}
              {groups.length > 1 && (
                <div className="flex items-center gap-2 mb-3 mt-1">
                  <span className="text-[10px] font-medium text-text-secondary uppercase tracking-[0.12em] font-(family-name:--font-dm-mono)">
                    Pass {group.iteration + 1}
                  </span>
                  <div className="flex-1 h-px bg-border-subtle" />
                </div>
              )}

              {/* Node entries for this pass */}
              {group.entries.map(entry => (
                <EntryRow key={entry.id} entry={entry} />
              ))}

              {/* Reflection decision for this pass */}
              {group.decision && (
                <div className="my-3 px-3 py-2.5 rounded-lg border border-border-subtle bg-bg-elevated/50">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                      style={{
                        background: `color-mix(in srgb, ${group.decision.color} 15%, transparent)`,
                        border: `1px solid color-mix(in srgb, ${group.decision.color} 30%, transparent)`,
                      }}
                    >
                      <FeedIcon icon="reflection" color={group.decision.color} />
                    </div>
                    <span className="text-[11px] font-medium font-(family-name:--font-dm-sans)" style={{ color: group.decision.color }}>
                      {group.decision.title}
                    </span>
                  </div>
                  {group.decision.detail && (
                    <ExpandableText text={group.decision.detail} className="mt-1.5 pl-7" />
                  )}
                </div>
              )}

              {/* Divider between passes */}
              {groupIdx < groups.length - 1 && !group.decision && (
                <div className="h-px bg-border-subtle my-3" />
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Evaluating indicator */}
        <AnimatePresence>
          {isEvaluating && (
            <motion.div
              className="mt-3"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 bg-accent-blue/15 border border-accent-blue/30">
                  <FeedIcon icon="evaluating" color="var(--color-accent-blue)" />
                </div>
                <div>
                  <p className="text-xs font-medium text-accent-blue font-(family-name:--font-dm-sans)">
                    Evaluating
                  </p>
                  <p className="text-[11px] text-text-muted mt-0.5 font-(family-name:--font-dm-mono)">
                    Scoring quality, relevance, groundedness...
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error display */}
        {error && (
          <motion.div
            className="mt-3 px-3 py-3 rounded-lg bg-accent-red/8 border border-accent-red/20"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 bg-accent-red/15 border border-accent-red/30">
                <svg className="w-3.5 h-3.5 text-accent-red" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
              </div>
              <div>
                <p className="text-xs font-medium text-accent-red font-(family-name:--font-dm-sans)">
                  Pipeline Error
                </p>
                <p className="text-[11px] text-text-muted mt-1 font-(family-name:--font-dm-mono) leading-relaxed">
                  {error}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}
