'use client'
import { useState, useCallback, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { UserButton, useAuth } from '@clerk/nextjs'
import ResearchForm from '@/components/ResearchForm'
import TracePanel from '@/components/TracePanel'
import DraftOutput from '@/components/DraftOutput'
import ActivityFeed from '@/components/ActivityFeed'
import ApiKeyModal from '@/components/ApiKeyModal'
import { streamResearch, streamRefine, cancelResearch, fetchDomains, checkKeys, saveKey, RateLimitExceededError } from '@/lib/api'
import type { ApiKeys, Domain } from '@/lib/api'
import type { TraceStep, NodeName, RunResult, ReflectionAction } from '@/lib/types'
import Link from 'next/link'

const INITIAL_PASS_NODES: NodeName[] = ['planner', 'searcher', 'summariser', 'outliner', 'drafter', 'reflection']
const RESEARCH_LOOP_NODES: NodeName[] = ['searcher', 'summariser', 'outliner', 'drafter', 'reflection']
const REVISE_LOOP_NODES: NodeName[] = ['drafter', 'reflection']

function makeInitialSteps(): TraceStep[] {
  return INITIAL_PASS_NODES.map(name => ({
    id: `0-${name}`,
    type: 'node' as const,
    node: name,
    status: 'pending' as const,
    iteration: 0,
  }))
}

function addLoopSteps(
  prev: TraceStep[],
  action: ReflectionAction,
  critique: string,
  iteration: number,
): TraceStep[] {
  const steps = [...prev]

  steps.push({
    id: `decision-${iteration}`,
    type: 'reflection_decision',
    status: 'complete',
    iteration: iteration - 1,
    reflectionAction: action,
    critique,
  })

  const loopNodes = action === 'research' ? RESEARCH_LOOP_NODES : REVISE_LOOP_NODES
  for (const name of loopNodes) {
    steps.push({
      id: `${iteration}-${name}`,
      type: 'node',
      node: name,
      status: 'pending',
      iteration,
    })
  }

  return steps
}

export default function Home() {
  const { isLoaded } = useAuth()
  const [steps, setSteps] = useState<TraceStep[]>(makeInitialSteps())
  const [result, setResult] = useState<RunResult | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [isEvaluating, setIsEvaluating] = useState(false)
  const [isRefining, setIsRefining] = useState(false)
  const [contentTab, setContentTab] = useState<'article' | 'activity'>('activity')
  const [pipelineError, setPipelineError] = useState<{ code: string; detail: string } | null>(null)
  const [refineExpired, setRefineExpired] = useState(false)

  // Domain selector
  const [domains, setDomains] = useState<Domain[]>([{ id: 'general', label: 'General Research' }])
  const [selectedDomain, setSelectedDomain] = useState('general')

  // Fetch available domains on mount
  useEffect(() => {
    fetchDomains().then(setDomains).catch(() => {})
  }, [])

  // Restore completed result from sessionStorage (survives navigation to /evals)
  // Only the result is persisted — pipeline state (steps, running flags) is always transient
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('lumen_last_result')
      if (saved) {
        const savedResult = JSON.parse(saved)
        if (savedResult) {
          setResult(savedResult)
          // Derive completed steps — all nodes shown as done
          const completedSteps: TraceStep[] = INITIAL_PASS_NODES.map(name => ({
            id: `0-${name}`,
            type: 'node' as const,
            node: name,
            status: 'complete' as const,
            iteration: 0,
          }))
          setSteps(completedSteps)
          setContentTab('article')
        }
      }
    } catch {}
  }, [])

  // Persist only the completed result — never pipeline state
  useEffect(() => {
    if (result && !isRunning && !isRefining && !isEvaluating) {
      try {
        sessionStorage.setItem('lumen_last_result', JSON.stringify(result))
      } catch {}
    }
  }, [result, isRunning, isRefining, isEvaluating])

  // BYOK (Bring Your Own Keys) state
  const [hasKey, setHasKey] = useState(false)
  const [keyPreview, setKeyPreview] = useState<string | null>(null)
  const [apiKeys, setApiKeys] = useState<ApiKeys | null>(null)
  const [showKeyModal, setShowKeyModal] = useState(false)
  const [rateLimitMessage, setRateLimitMessage] = useState('')

  // Check if user has a saved key — wait until Clerk session is ready
  useEffect(() => {
    if (!isLoaded) return
    checkKeys().then(status => {
      setHasKey(status.has_key)
      setKeyPreview(status.preview ?? null)
      if (!status.has_key) {
        setShowKeyModal(true)
        setRateLimitMessage('Enter your Anthropic API key to start researching.')
      }
    }).catch(() => {
      setPipelineError({ code: 'database', detail: 'Could not connect to the server. Please refresh and try again.' })
    })
  }, [isLoaded])
  // Store the pending action so we can retry after keys are provided
  const pendingAction = useRef<{ type: 'research'; topic: string } | { type: 'refine' } | null>(null)
  // Track active run for cancellation
  const activeRunId = useRef<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Page close/refresh — send cancel POST since AbortController doesn't survive unload
  useEffect(() => {
    const handleUnload = () => {
      if (activeRunId.current) {
        cancelResearch(activeRunId.current)
      }
    }
    window.addEventListener('beforeunload', handleUnload)
    return () => window.removeEventListener('beforeunload', handleUnload)
  }, [])

  // Single function to reset all pipeline state
  const resetPipeline = useCallback((opts?: { clearResult?: boolean; keepSteps?: boolean }) => {
    setIsRunning(false)
    setIsRefining(false)
    setIsEvaluating(false)
    if (!opts?.keepSteps) {
      setSteps(makeInitialSteps())
    }
    setPipelineError(null)
    activeRunId.current = null
    if (opts?.clearResult) {
      setResult(null)
      setContentTab('activity')
      sessionStorage.removeItem('lumen_last_result')
    }
  }, [])

  const handleCancel = useCallback(() => {
    // Abort the fetch — kills SSE stream, FastAPI detects disconnect
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    // Also set Redis flag for any in-flight LLM call
    if (activeRunId.current) {
      cancelResearch(activeRunId.current)
    }
    resetPipeline({ clearResult: true })
  }, [resetPipeline])

  const processNodeComplete = useCallback((
    event: { node: string; timing_ms: number | null; iteration: number; reflection_action?: string; critique?: string; meta?: Record<string, unknown> },
    setStepsFn: typeof setSteps,
  ) => {
    const completedNode = event.node as NodeName
    const iteration = event.iteration

    setStepsFn(prev => {
      let updated = prev.map(s => ({ ...s }))

      const stepId = `${iteration}-${completedNode}`
      const stepIdx = updated.findIndex(s => s.id === stepId)
      if (stepIdx !== -1) {
        updated[stepIdx].status = 'complete'
        updated[stepIdx].timing_ms = event.timing_ms ?? undefined
        updated[stepIdx].meta = event.meta
      }

      // Mark any skipped nodes (e.g., outliner on revision loops) as complete
      const currentIterNodes = iteration === 0 ? INITIAL_PASS_NODES :
        (updated.some(s => s.id === `${iteration}-searcher`) ? RESEARCH_LOOP_NODES : REVISE_LOOP_NODES)
      const completedNodeIdx = currentIterNodes.indexOf(completedNode)
      for (let i = 0; i < completedNodeIdx; i++) {
        const priorId = `${iteration}-${currentIterNodes[i]}`
        const priorStep = updated.find(s => s.id === priorId)
        if (priorStep && priorStep.status !== 'complete') {
          priorStep.status = 'complete'
        }
      }

      if (completedNode === 'reflection') {
        const action = event.reflection_action as ReflectionAction | undefined
        const critique = event.critique ?? ''

        if (action && action !== 'accept') {
          updated = addLoopSteps(updated, action, critique, iteration + 1)
          const nextLoopNodes = action === 'research' ? RESEARCH_LOOP_NODES : REVISE_LOOP_NODES
          const nextRunningId = `${iteration + 1}-${nextLoopNodes[0]}`
          const nextIdx = updated.findIndex(s => s.id === nextRunningId)
          if (nextIdx !== -1) {
            updated[nextIdx].status = 'running'
          }
        } else {
          updated.push({
            id: `decision-accept-${iteration}`,
            type: 'reflection_decision',
            status: 'complete',
            iteration,
            reflectionAction: 'accept',
            critique,
          })
        }
      } else {
        const iterNodes = iteration === 0 ? INITIAL_PASS_NODES :
          (updated.some(s => s.id === `${iteration}-searcher`) ? RESEARCH_LOOP_NODES : REVISE_LOOP_NODES)
        const nodeIdx = iterNodes.indexOf(completedNode)
        if (nodeIdx !== -1 && nodeIdx < iterNodes.length - 1) {
          const next = iterNodes[nodeIdx + 1]
          const nextId = `${iteration}-${next}`
          const nextStepIdx = updated.findIndex(s => s.id === nextId)
          if (nextStepIdx !== -1) {
            updated[nextStepIdx].status = 'running'
          }
        }
      }

      return updated
    })

  }, [])

  const handleSubmit = useCallback(async (topic: string, keys?: ApiKeys | null) => {
    const effectiveKeys = keys ?? apiKeys ?? undefined
    // Clear persisted state first — before any running flags are set
    sessionStorage.removeItem('lumen_last_result')
    setResult(null)
    setPipelineError(null)
    setRefineExpired(false)
    // Then set running state
    setIsRunning(true)
    setIsEvaluating(false)
    setContentTab('activity')

    const controller = new AbortController()
    abortControllerRef.current = controller

    const fresh = makeInitialSteps()
    const plannerStep = fresh.find(s => s.id === '0-planner')
    if (plannerStep) plannerStep.status = 'running'
    setSteps(fresh)

    try {
      for await (const event of streamResearch(topic, selectedDomain, effectiveKeys, controller.signal)) {
        if (event.type === 'start') {
          activeRunId.current = event.run_id
        } else if (event.type === 'node_complete') {
          processNodeComplete(event, setSteps)
        } else if (event.type === 'eval_start') {
          setIsEvaluating(true)
      
        } else if (event.type === 'cancelled') {
          resetPipeline({ clearResult: true })
        } else if (event.type === 'error') {
          resetPipeline()
          setPipelineError({ code: event.code ?? 'unknown', detail: event.detail })
        } else if (event.type === 'complete') {
          resetPipeline({ keepSteps: true })
          setResult(event.data)
          setContentTab('article')
        }
      }
    } catch (err) {
      if (!activeRunId.current) return // User cancelled — resetPipeline already handled cleanup
      resetPipeline()
      if (err instanceof RateLimitExceededError) {
        if (err.code !== 'concurrent_limit') {
          pendingAction.current = { type: 'research', topic }
          setRateLimitMessage(err.message)
          setShowKeyModal(true)
        }
      } else {
        console.error('Research stream error:', err)
      }
    }
  }, [processNodeComplete, apiKeys, selectedDomain, resetPipeline])

  // Track the iteration offset for refine — maps backend iteration 0 to the correct frontend pass
  const refineIterationOffset = useRef(0)
  const stepsRef = useRef(steps)
  stepsRef.current = steps

  const handleRefine = useCallback(async (keys?: ApiKeys | null) => {
    if (!result?.run_id) return
    const effectiveKeys = keys ?? apiKeys ?? undefined
    setIsRefining(true)
    setIsEvaluating(false)
    setRefineExpired(false)
    setPipelineError(null)
    setContentTab('activity')

    // Calculate next iteration from existing steps to avoid ID collision
    const maxIteration = stepsRef.current.reduce((max, s) => Math.max(max, s.iteration), 0)
    const refineIteration = maxIteration + 1
    refineIterationOffset.current = refineIteration

    // Add a decision marker + new pass steps, keeping previous activity
    setSteps(prev => {
      const updated = [...prev]
      updated.push({
        id: `decision-refine-${refineIteration}`,
        type: 'reflection_decision',
        status: 'complete',
        iteration: maxIteration,
        reflectionAction: 'research',
        critique: 'Dig Deeper — additional research pass',
      })
      for (const name of INITIAL_PASS_NODES) {
        updated.push({
          id: `${refineIteration}-${name}`,
          type: 'node',
          node: name,
          status: name === 'planner' ? 'running' : 'pending',
          iteration: refineIteration,
        })
      }
      return updated
    })

    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      for await (const event of streamRefine(result.run_id, effectiveKeys, controller.signal)) {
        if (event.type === 'start') {
          activeRunId.current = event.run_id
        } else if (event.type === 'node_complete') {
          // Remap backend iteration 0 to the refine iteration offset
          const remapped = { ...event, iteration: event.iteration + refineIterationOffset.current }
          processNodeComplete(remapped, setSteps)
        } else if (event.type === 'eval_start') {
          setIsEvaluating(true)
      
        } else if (event.type === 'cancelled') {
          resetPipeline({ clearResult: true })
        } else if (event.type === 'error') {
          resetPipeline()
          setPipelineError({ code: event.code ?? 'unknown', detail: event.detail })
        } else if (event.type === 'complete') {
          resetPipeline({ keepSteps: true })
          setResult(event.data)
          setContentTab('article')
        }
      }
    } catch (err) {
      if (!activeRunId.current) return // User cancelled — resetPipeline already handled cleanup
      resetPipeline()
      if (err instanceof RateLimitExceededError) {
        if (err.code !== 'concurrent_limit') {
          pendingAction.current = { type: 'refine' }
          setRateLimitMessage(err.message)
          setShowKeyModal(true)
        }
      } else if (err instanceof Error && err.message.includes('not found')) {
        setRefineExpired(true)
      } else {
        console.error('Refine stream error:', err)
      }
    }
  }, [result?.run_id, processNodeComplete, apiKeys, resetPipeline])

  const handleKeysSubmit = useCallback(async (keys: ApiKeys) => {
    setApiKeys(keys)
    setShowKeyModal(false)
    // Encrypt and save to server
    try {
      await saveKey(keys.anthropic_api_key)
      setHasKey(true)
      setKeyPreview(`...${keys.anthropic_api_key.slice(-4)}`)
    } catch {}
    // Retry the pending action with the new keys
    const action = pendingAction.current
    pendingAction.current = null
    if (action?.type === 'research') {
      handleSubmit(action.topic, keys)
    } else if (action?.type === 'refine') {
      handleRefine(keys)
    }
  }, [handleSubmit, handleRefine])

  const showPipeline = isRunning || isRefining || isEvaluating || result

  return (
    <div className="h-screen bg-bg-primary flex flex-col overflow-hidden">
      {/* Ambient gradient */}
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(226,164,59,0.03),transparent_70%)] pointer-events-none" />

      {/* BYOK modal */}
      <AnimatePresence>
        {showKeyModal && (
          <ApiKeyModal
            title={hasKey ? 'Update API Key' : 'Welcome to Lumen'}
            message={rateLimitMessage}
            onSubmit={handleKeysSubmit}
            onDismiss={hasKey ? () => {
              setShowKeyModal(false)
              pendingAction.current = null
              resetPipeline()
            } : undefined}
          />
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="relative z-20 border-b border-border-subtle px-6 py-3 flex items-center justify-between bg-bg-primary/80 backdrop-blur-md shrink-0">
        <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <svg width="18" height="18" viewBox="0 0 32 32" fill="none" className="shrink-0">
            <path d="M16 4L26 16L16 28L6 16Z" stroke="#e2a43b" strokeWidth="1.5" fill="rgba(226,164,59,0.1)" />
            <path d="M16 10L21 16L16 22L11 16Z" fill="#e2a43b" />
            <path d="M26 16h4M2 12h6M2 20h6" stroke="#e2a43b" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
          </svg>
          <span className="font-semibold text-text-primary text-sm tracking-[0.15em] font-(family-name:--font-dm-sans)">
            LUMEN
          </span>
          <span className="text-[10px] font-(family-name:--font-dm-mono) text-text-muted tracking-wider hidden sm:inline">
            v1.0
          </span>
        </Link>
        <div className="flex items-center gap-3">
          <Link
            href="/evals"
            className="flex items-center gap-2 text-[11px] text-text-secondary hover:text-accent-amber bg-bg-elevated hover:bg-bg-elevated/80 border border-border-subtle hover:border-accent-amber/30 px-3 py-1.5 rounded-lg transition-all duration-200 font-(family-name:--font-dm-mono)"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
            Eval Dashboard
          </Link>
          <UserButton>
            <UserButton.MenuItems>
              <UserButton.Action
                label={hasKey ? `API Key (${keyPreview})` : 'Add API Key'}
                labelIcon={
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                  </svg>
                }
                onClick={() => {
                  setRateLimitMessage(hasKey ? 'Update or replace your Anthropic API key.' : 'Enter your Anthropic API key to start researching.')
                  setShowKeyModal(true)
                }}
              />
            </UserButton.MenuItems>
          </UserButton>
        </div>
      </header>

      {/* Research input bar */}
      <div className="relative z-10 shrink-0">
        <ResearchForm
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          isRunning={isRunning || isRefining}
          domains={domains}
          selectedDomain={selectedDomain}
          onDomainChange={setSelectedDomain}
        />
      </div>

      {/* Pipeline stepper */}
      <AnimatePresence>
        {showPipeline && (
          <motion.div
            className="relative z-10 shrink-0 px-5 pb-2"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
          >
            <TracePanel steps={steps} isEvaluating={isEvaluating} compact={!!result} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main content */}
      <div className="relative z-10 flex-1 min-h-0 px-5 pb-5 flex flex-col">
        {/* Tabs — show when pipeline has started */}
        {(isRunning || isRefining || isEvaluating || result) && (
          <div className="flex gap-1 mb-2 shrink-0">
            <button
              onClick={() => setContentTab('activity')}
              className={`px-3 py-1.5 rounded-md text-[11px] font-medium transition-all duration-200 font-(family-name:--font-dm-mono) ${
                contentTab === 'activity'
                  ? 'bg-bg-elevated text-text-primary border border-border-default'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              Activity
            </button>
            <button
              onClick={() => setContentTab('article')}
              disabled={!result}
              className={`px-3 py-1.5 rounded-md text-[11px] font-medium transition-all duration-200 font-(family-name:--font-dm-mono) disabled:opacity-30 disabled:cursor-not-allowed ${
                contentTab === 'article'
                  ? 'bg-bg-elevated text-text-primary border border-border-default'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              Article
            </button>
          </div>
        )}

        {/* Tab content */}
        <div className="flex-1 min-h-0">
          <AnimatePresence mode="wait">
            {!(isRunning || isRefining || isEvaluating || result) ? (
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
                    Enter a topic to begin research
                  </p>
                </div>
              </motion.div>
            ) : contentTab === 'article' && result ? (
              <motion.div
                key="article"
                className="h-full"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2 }}
              >
                <DraftOutput
                  draft={result.draft}
                  sources={result.sources}
                  scores={result.scores}
                  onRefine={refineExpired ? undefined : handleRefine}
                  isRefining={isRefining}
                  refineExpired={refineExpired}
                />
              </motion.div>
            ) : (
              <motion.div
                key="activity"
                className="h-full"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2 }}
              >
                <ActivityFeed steps={steps} isEvaluating={isEvaluating} error={pipelineError} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
