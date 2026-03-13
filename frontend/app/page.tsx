'use client'
import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import ResearchForm from '@/components/ResearchForm'
import TracePanel from '@/components/TracePanel'
import DraftOutput from '@/components/DraftOutput'
import { streamResearch, streamRefine } from '@/lib/api'
import type { TraceNode, NodeName, RunResult } from '@/lib/types'
import Link from 'next/link'

const NODE_ORDER: NodeName[] = ['planner', 'searcher', 'summariser', 'drafter', 'reflection']

const NEXT_NODE: Record<NodeName, NodeName | null> = {
  planner: 'searcher',
  searcher: 'summariser',
  summariser: 'drafter',
  drafter: 'reflection',
  reflection: null,
}

function makeInitialNodes(): TraceNode[] {
  return NODE_ORDER.map(name => ({
    name,
    label: name.charAt(0).toUpperCase() + name.slice(1),
    status: 'pending' as const,
  }))
}

export default function Home() {
  const [nodes, setNodes] = useState<TraceNode[]>(makeInitialNodes())
  const [result, setResult] = useState<RunResult | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [isEvaluating, setIsEvaluating] = useState(false)
  const [currentNode, setCurrentNode] = useState<NodeName | null>(null)
  const [isRefining, setIsRefining] = useState(false)

  const handleSubmit = useCallback(async (topic: string) => {
    setIsRunning(true)
    setResult(null)
    setIsEvaluating(false)

    const fresh = makeInitialNodes()
    fresh[0].status = 'running'
    setNodes(fresh)
    setCurrentNode('planner')

    try {
      for await (const event of streamResearch(topic)) {
        if (event.type === 'node_complete') {
          const completedNode = event.node as NodeName
          const nextNode = NEXT_NODE[completedNode]

          setNodes(prev => {
            const updated = prev.map(n => ({ ...n }))

            const completedIdx = updated.findIndex(n => n.name === completedNode)
            if (completedIdx !== -1) {
              updated[completedIdx].status = 'complete'
              updated[completedIdx].timing_ms = event.timing_ms ?? undefined
              updated[completedIdx].iteration = event.iteration
            }

            if (nextNode) {
              const nextIdx = updated.findIndex(n => n.name === nextNode)
              if (nextIdx !== -1) {
                updated[nextIdx].status = 'running'
                updated[nextIdx].timing_ms = undefined
                for (let i = nextIdx + 1; i < updated.length; i++) {
                  updated[i].status = 'pending'
                  updated[i].timing_ms = undefined
                }
              }
              setCurrentNode(nextNode)
            } else {
              setCurrentNode(null)
            }

            return updated
          })
        } else if (event.type === 'eval_start') {
          setNodes(prev => prev.map(n => ({
            ...n,
            status: 'complete',
          })))
          setIsEvaluating(true)
          setCurrentNode(null)
        } else if (event.type === 'complete') {
          setResult(event.data)
          setIsRunning(false)
          setIsEvaluating(false)
        }
      }
    } catch (err) {
      console.error('Research stream error:', err)
      setIsRunning(false)
      setIsEvaluating(false)
    }
  }, [])

  const handleRefine = useCallback(async () => {
    if (!result?.run_id) return
    setIsRefining(true)
    setIsEvaluating(false)

    const fresh = makeInitialNodes()
    fresh[0].status = 'running'
    setNodes(fresh)
    setCurrentNode('planner')

    try {
      for await (const event of streamRefine(result.run_id)) {
        if (event.type === 'node_complete') {
          const completedNode = event.node as NodeName
          const nextNode = NEXT_NODE[completedNode]

          setNodes(prev => {
            const updated = prev.map(n => ({ ...n }))
            const completedIdx = updated.findIndex(n => n.name === completedNode)
            if (completedIdx !== -1) {
              updated[completedIdx].status = 'complete'
              updated[completedIdx].timing_ms = event.timing_ms ?? undefined
              updated[completedIdx].iteration = event.iteration
            }
            if (nextNode) {
              const nextIdx = updated.findIndex(n => n.name === nextNode)
              if (nextIdx !== -1) {
                updated[nextIdx].status = 'running'
                updated[nextIdx].timing_ms = undefined
              }
              setCurrentNode(nextNode)
            } else {
              setCurrentNode(null)
            }
            return updated
          })
        } else if (event.type === 'eval_start') {
          setNodes(prev => prev.map(n => ({ ...n, status: 'complete' as const })))
          setIsEvaluating(true)
          setCurrentNode(null)
        } else if (event.type === 'complete') {
          setResult(event.data)
          setIsRefining(false)
          setIsEvaluating(false)
        }
      }
    } catch (err) {
      console.error('Refine stream error:', err)
      setIsRefining(false)
      setIsEvaluating(false)
    }
  }, [result?.run_id])

  return (
    <div className="h-screen bg-bg-primary overflow-hidden">
      {/* Ambient gradient */}
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(226,164,59,0.04),transparent_70%)] pointer-events-none" />

      <header className="sticky top-0 z-20 border-b border-border-subtle px-6 py-3 flex items-center justify-between bg-bg-primary/80 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <svg width="18" height="18" viewBox="0 0 32 32" fill="none" className="shrink-0">
            <path d="M16 4L26 16L16 28L6 16Z" stroke="#e2a43b" strokeWidth="1.5" fill="rgba(226,164,59,0.1)" />
            <path d="M16 10L21 16L16 22L11 16Z" fill="#e2a43b" />
            <path d="M26 16h4M2 12h6M2 20h6" stroke="#e2a43b" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
          </svg>
          <span className="font-semibold text-text-primary text-sm tracking-[0.15em] font-(family-name:--font-dm-sans)">
            LUMEN
          </span>
          <span className="text-[10px] font-(family-name:--font-dm-mono) text-text-muted tracking-wider">
            v1.0
          </span>
        </div>
        <Link
          href="/evals"
          className="text-xs text-text-muted hover:text-accent-amber transition-colors duration-300 font-(family-name:--font-dm-mono)"
        >
          Eval History &rarr;
        </Link>
      </header>

      <main className="relative z-10 p-5 max-w-[1600px] mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 h-[calc(100vh-72px)]">
          <motion.div
            className="min-h-0 overflow-hidden flex flex-col gap-4"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            <ResearchForm
              onSubmit={handleSubmit}
              isRunning={isRunning}
              currentNode={currentNode}
              isEvaluating={isEvaluating}
            />
            <TracePanel nodes={nodes} isEvaluating={isEvaluating} />
          </motion.div>

          <motion.div
            className="min-h-0 overflow-hidden"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            <AnimatePresence mode="wait">
              {result ? (
                <motion.div
                  key="result"
                  className="h-full"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                >
                  <DraftOutput
                    draft={result.draft}
                    sources={result.sources}
                    scores={result.scores}
                    onRefine={handleRefine}
                    isRefining={isRefining}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="empty"
                  className="surface h-full flex items-center justify-center"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  <div className="text-center px-8">
                    <div className="w-12 h-12 rounded-full border border-border-default mx-auto mb-5 flex items-center justify-center bg-bg-elevated">
                      <svg className="w-5 h-5 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                    </div>
                    <p className="text-sm text-text-muted font-(family-name:--font-dm-sans)">
                      {isRunning
                        ? 'Generating article...'
                        : 'Enter a topic to begin research'
                      }
                    </p>
                    {isRunning && (
                      <div className="mt-4 flex justify-center">
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
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </main>
    </div>
  )
}
