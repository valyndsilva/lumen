import { describe, it, expect, beforeEach } from 'vitest'

// Test the sessionStorage persistence logic extracted from research/page.tsx

const STORAGE_KEY = 'lumen_last_result'

function saveResult(result: object | null, isRunning: boolean, isRefining: boolean, isEvaluating: boolean) {
  if (result && !isRunning && !isRefining && !isEvaluating) {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(result))
  }
}

function restoreResult(): { result: object | null; tab: string } {
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY)
    if (saved) {
      const result = JSON.parse(saved)
      if (result) {
        return { result, tab: 'article' }
      }
    }
  } catch {}
  return { result: null, tab: 'activity' }
}

function clearResult() {
  sessionStorage.removeItem(STORAGE_KEY)
}

describe('Session storage persistence', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('saves result when pipeline is idle', () => {
    const result = { draft: 'text', run_id: 'r1' }
    saveResult(result, false, false, false)
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeTruthy()
  })

  it('does not save when pipeline is running', () => {
    saveResult({ draft: 'text' }, true, false, false)
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('does not save when refining', () => {
    saveResult({ draft: 'text' }, false, true, false)
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('does not save when evaluating', () => {
    saveResult({ draft: 'text' }, false, false, true)
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('does not save null result', () => {
    saveResult(null, false, false, false)
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('restores saved result', () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ draft: 'text', run_id: 'r1' }))
    const { result, tab } = restoreResult()
    expect(result).toEqual({ draft: 'text', run_id: 'r1' })
    expect(tab).toBe('article')
  })

  it('returns null when nothing saved', () => {
    const { result, tab } = restoreResult()
    expect(result).toBeNull()
    expect(tab).toBe('activity')
  })

  it('handles corrupted storage gracefully', () => {
    sessionStorage.setItem(STORAGE_KEY, 'not-json{{{')
    const { result } = restoreResult()
    expect(result).toBeNull()
  })

  it('clearResult removes from storage', () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ draft: 'text' }))
    clearResult()
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('new research clears old result before starting', () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ draft: 'old' }))
    clearResult() // simulates handleSubmit clearing before run
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('cancel clears result from storage', () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ draft: 'text' }))
    clearResult() // simulates resetPipeline({ clearResult: true })
    const { result } = restoreResult()
    expect(result).toBeNull()
  })
})
