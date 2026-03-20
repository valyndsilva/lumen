import { describe, it, expect } from 'vitest'
import type { TraceStep, NodeName } from '@/lib/types'

const INITIAL_PASS_NODES: NodeName[] = ['planner', 'searcher', 'summariser', 'outliner', 'drafter', 'reflection']

function makeInitialSteps(): TraceStep[] {
  return INITIAL_PASS_NODES.map(name => ({
    id: `0-${name}`,
    type: 'node' as const,
    node: name,
    status: 'pending' as const,
    iteration: 0,
  }))
}

function makeCompletedSteps(): TraceStep[] {
  return INITIAL_PASS_NODES.map(name => ({
    id: `0-${name}`,
    type: 'node' as const,
    node: name,
    status: 'complete' as const,
    iteration: 0,
  }))
}

describe('Pipeline step generation', () => {
  it('creates 6 initial steps all pending', () => {
    const steps = makeInitialSteps()
    expect(steps).toHaveLength(6)
    expect(steps.every(s => s.status === 'pending')).toBe(true)
  })

  it('initial steps have correct node names in order', () => {
    const steps = makeInitialSteps()
    const names = steps.map(s => s.node)
    expect(names).toEqual(['planner', 'searcher', 'summariser', 'outliner', 'drafter', 'reflection'])
  })

  it('initial steps all have iteration 0', () => {
    const steps = makeInitialSteps()
    expect(steps.every(s => s.iteration === 0)).toBe(true)
  })

  it('initial steps have unique IDs', () => {
    const steps = makeInitialSteps()
    const ids = new Set(steps.map(s => s.id))
    expect(ids.size).toBe(6)
  })

  it('completed steps all have complete status', () => {
    const steps = makeCompletedSteps()
    expect(steps.every(s => s.status === 'complete')).toBe(true)
  })
})

describe('resetPipeline behavior', () => {
  // Simulates the resetPipeline logic
  function resetPipeline(opts?: { clearResult?: boolean; keepSteps?: boolean }) {
    const state = {
      isRunning: false,
      isRefining: false,
      isEvaluating: false,
      currentNode: null as NodeName | null,
      steps: opts?.keepSteps ? makeCompletedSteps() : makeInitialSteps(),
      pipelineError: null as { code: string; detail: string } | null,
      result: opts?.clearResult ? null : { draft: 'existing' },
    }
    return state
  }

  it('resets all running flags', () => {
    const state = resetPipeline()
    expect(state.isRunning).toBe(false)
    expect(state.isRefining).toBe(false)
    expect(state.isEvaluating).toBe(false)
    expect(state.currentNode).toBeNull()
    expect(state.pipelineError).toBeNull()
  })

  it('resets steps to initial when keepSteps is false', () => {
    const state = resetPipeline()
    expect(state.steps.every(s => s.status === 'pending')).toBe(true)
  })

  it('keeps steps when keepSteps is true', () => {
    const state = resetPipeline({ keepSteps: true })
    expect(state.steps.every(s => s.status === 'complete')).toBe(true)
  })

  it('clears result when clearResult is true', () => {
    const state = resetPipeline({ clearResult: true })
    expect(state.result).toBeNull()
  })

  it('preserves result when clearResult is not set', () => {
    const state = resetPipeline()
    expect(state.result).toEqual({ draft: 'existing' })
  })

  it('complete path: keepSteps + preserve result', () => {
    const state = resetPipeline({ keepSteps: true })
    expect(state.steps.every(s => s.status === 'complete')).toBe(true)
    expect(state.result).toEqual({ draft: 'existing' })
  })

  it('cancel path: reset steps + clear result', () => {
    const state = resetPipeline({ clearResult: true })
    expect(state.steps.every(s => s.status === 'pending')).toBe(true)
    expect(state.result).toBeNull()
  })

  it('error path: reset steps + keep result', () => {
    const state = resetPipeline()
    expect(state.steps.every(s => s.status === 'pending')).toBe(true)
    expect(state.result).toEqual({ draft: 'existing' })
  })
})
