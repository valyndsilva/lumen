'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { fetchEvals } from '@/lib/api'
import ScoreChart from '@/components/ScoreChart'
import EvalsTable from '@/components/EvalsTable'
import type { EvalRun } from '@/lib/types'

export default function EvalsPage() {
  const [runs, setRuns] = useState<EvalRun[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchEvals()
      .then(setRuns)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  // Regression detection
  let regression = false
  if (runs.length >= 2) {
    const latest = runs[0]
    const previous = runs[1]
    const latestAvg = ((latest.quality ?? 0) + (latest.relevance ?? 0) + (latest.groundedness ?? 0)) / 3
    const prevAvg = ((previous.quality ?? 0) + (previous.relevance ?? 0) + (previous.groundedness ?? 0)) / 3
    regression = prevAvg - latestAvg > 0.5
  }

  return (
    <div className="min-h-screen bg-bg-primary">
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(226,164,59,0.04),transparent_70%)] pointer-events-none" />

      <header className="sticky top-0 z-20 border-b border-border-subtle px-6 py-3 flex items-center justify-between bg-bg-primary/80 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-2 h-2 rounded-full bg-accent-amber" />
            <div className="absolute inset-0 w-2 h-2 rounded-full bg-accent-amber animate-ping opacity-20" />
          </div>
          <span className="font-semibold text-text-primary text-sm tracking-[0.15em] font-(family-name:--font-dm-sans)">
            LUMEN
          </span>
          <span className="text-text-muted text-xs">/</span>
          <span className="text-text-secondary text-xs font-(family-name:--font-dm-mono)">evals</span>
        </div>
        <Link
          href="/"
          className="text-xs text-text-muted hover:text-accent-amber transition-colors duration-300 font-(family-name:--font-dm-mono)"
        >
          &larr; Back to Research
        </Link>
      </header>

      <main className="relative z-10 p-6 max-w-[1200px] mx-auto space-y-5">
        {regression && (
          <div className="bg-accent-red/8 border border-accent-red/20 rounded-xl px-4 py-3 flex items-center gap-2">
            <span className="text-accent-red text-xs font-medium font-(family-name:--font-dm-mono)">
              Regression detected — latest run scored significantly lower
            </span>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-5 h-5 border-2 border-border-default border-t-accent-amber rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <ScoreChart runs={runs} />
            <EvalsTable runs={runs} />
          </>
        )}
      </main>
    </div>
  )
}
