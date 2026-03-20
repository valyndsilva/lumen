'use client'
import { useState, useEffect } from 'react'
import { useAuth } from '@clerk/nextjs'
import Link from 'next/link'
import { fetchEvals } from '@/lib/api'
import ScoreChart from '@/components/ScoreChart'
import EvalsTable from '@/components/EvalsTable'
import type { EvalRun } from '@/lib/types'

export default function EvalsPage() {
  const { isLoaded } = useAuth()
  const [runs, setRuns] = useState<EvalRun[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isLoaded) return
    fetchEvals()
      .then(setRuns)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [isLoaded])

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
        <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <svg width="18" height="18" viewBox="0 0 32 32" fill="none" className="shrink-0">
            <path d="M16 4L26 16L16 28L6 16Z" stroke="#e2a43b" strokeWidth="1.5" fill="rgba(226,164,59,0.1)" />
            <path d="M16 10L21 16L16 22L11 16Z" fill="#e2a43b" />
            <path d="M26 16h4M2 12h6M2 20h6" stroke="#e2a43b" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
          </svg>
          <span className="font-semibold text-text-primary text-sm tracking-[0.15em] font-(family-name:--font-dm-sans)">
            LUMEN
          </span>
          <span className="text-text-muted text-xs">/</span>
          <span className="text-text-secondary text-xs font-(family-name:--font-dm-mono)">evals</span>
        </Link>
        <Link
          href="/research"
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
