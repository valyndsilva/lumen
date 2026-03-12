'use client'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { EvalRun } from '@/lib/types'

interface ScoreChartProps {
  runs: EvalRun[]
}

export default function ScoreChart({ runs }: ScoreChartProps) {
  const data = [...runs]
    .reverse()
    .slice(-20)
    .map(run => ({
      date: new Date(run.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      quality: run.quality,
      relevance: run.relevance,
      groundedness: run.groundedness,
    }))

  if (data.length === 0) {
    return (
      <div className="surface p-8 flex items-center justify-center">
        <p className="text-sm text-text-muted font-(family-name:--font-dm-mono)">No runs yet. Research a topic to see score trends.</p>
      </div>
    )
  }

  return (
    <div className="surface p-5">
      <h2 className="text-[11px] font-medium text-text-muted uppercase tracking-[0.2em] mb-4 font-(family-name:--font-dm-mono)">
        Score Trends
      </h2>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2a" />
          <XAxis dataKey="date" tick={{ fill: '#55556a', fontSize: 11 }} stroke="#2a2a3a" />
          <YAxis domain={[0, 5]} tick={{ fill: '#55556a', fontSize: 11 }} stroke="#2a2a3a" />
          <Tooltip
            contentStyle={{
              backgroundColor: '#0f0f16',
              border: '1px solid #2a2a3a',
              borderRadius: '8px',
              fontSize: '11px',
              color: '#e8e8ed',
            }}
          />
          <Legend wrapperStyle={{ fontSize: '11px', color: '#8888a0' }} />
          <Line type="monotone" dataKey="quality" stroke="#34d399" strokeWidth={2} dot={{ r: 3, fill: '#34d399' }} />
          <Line type="monotone" dataKey="relevance" stroke="#e2a43b" strokeWidth={2} dot={{ r: 3, fill: '#e2a43b' }} />
          <Line type="monotone" dataKey="groundedness" stroke="#60a5fa" strokeWidth={2} dot={{ r: 3, fill: '#60a5fa' }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
