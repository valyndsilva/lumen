'use client'
import { motion } from 'motion/react'
import { useAuth, SignInButton, UserButton } from '@clerk/nextjs'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Legend } from 'recharts'
import Link from 'next/link'

const PIPELINE_STEPS = [
  { name: 'Planner', status: 'complete' as const },
  { name: 'Searcher', status: 'complete' as const },
  { name: 'Summariser', status: 'complete' as const },
  { name: 'Outliner', status: 'complete' as const },
  { name: 'Drafter', status: 'running' as const },
  { name: 'Reflection', status: 'pending' as const },
]

const MOCK_SCORES = [
  { label: 'Quality', value: 4.2, color: 'bg-accent-emerald' },
  { label: 'Relevance', value: 4.5, color: 'bg-accent-amber' },
  { label: 'Grounded', value: 3.9, color: 'bg-accent-blue' },
]

const MOCK_CHART_DATA = [
  { date: 'Mar 13', quality: 4.3, relevance: 4.5, groundedness: 3.5 },
  { date: 'Mar 14', quality: 4.1, relevance: 4.2, groundedness: 3.2 },
  { date: 'Mar 15', quality: 3.8, relevance: 4.4, groundedness: 3.0 },
  { date: 'Mar 16', quality: 4.4, relevance: 4.1, groundedness: 3.6 },
  { date: 'Mar 17', quality: 4.2, relevance: 4.6, groundedness: 3.4 },
  { date: 'Mar 18', quality: 4.5, relevance: 4.3, groundedness: 3.8 },
  { date: 'Mar 19', quality: 4.0, relevance: 4.5, groundedness: 3.5 },
  { date: 'Mar 19', quality: 4.3, relevance: 4.1, groundedness: 3.7 },
  { date: 'Mar 19', quality: 4.1, relevance: 4.4, groundedness: 3.3 },
  { date: 'Mar 20', quality: 4.2, relevance: 4.5, groundedness: 3.9 },
]

const MOCK_EVALS = [
  { topic: 'AI agents in software development 2026', quality: 4.2, relevance: 4.5, grounded: 3.9, date: 'Mar 20' },
  { topic: 'GLP-1 receptor agonists cardiovascular outcomes', quality: 4.5, relevance: 4.3, grounded: 4.1, date: 'Mar 20' },
  { topic: 'Google antitrust ruling Chrome divestiture', quality: 4.0, relevance: 4.2, grounded: 3.8, date: 'Mar 19' },
  { topic: 'Trump tariffs impact on global markets', quality: 3.8, relevance: 4.1, grounded: 3.6, date: 'Mar 19' },
]

const FEATURES = [
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    ),
    title: 'Articles That Improve Themselves',
    description: 'The agent reviews its own work, identifies gaps in evidence or structure, and loops back to fix them — automatically.',
    accent: 'amber' as const,
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    title: 'Watch Every Step Live',
    description: 'See the pipeline work in real-time — which sources it found, what outline it planned, and why it decided to loop back.',
    accent: 'emerald' as const,
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ),
    title: 'Research Any Domain',
    description: 'Switch between medical, legal, financial, or general research — each with domain-specific search, terminology, and quality checks.',
    accent: 'blue' as const,
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
    title: 'Quality You Can Measure',
    description: 'Every article is scored on quality, relevance, and groundedness. Track how scores trend across runs.',
    accent: 'red' as const,
  },
]

const ACCENT_STYLES = {
  amber: {
    iconBg: 'bg-accent-amber/10 border-accent-amber/20',
    iconText: 'text-accent-amber',
    hoverBorder: 'hover:border-accent-amber/30',
    glow: 'hover:shadow-[0_0_30px_rgba(226,164,59,0.06)]',
  },
  emerald: {
    iconBg: 'bg-accent-emerald/10 border-accent-emerald/20',
    iconText: 'text-accent-emerald',
    hoverBorder: 'hover:border-accent-emerald/30',
    glow: 'hover:shadow-[0_0_30px_rgba(52,211,153,0.06)]',
  },
  blue: {
    iconBg: 'bg-accent-blue/10 border-accent-blue/20',
    iconText: 'text-accent-blue',
    hoverBorder: 'hover:border-accent-blue/30',
    glow: 'hover:shadow-[0_0_30px_rgba(96,165,250,0.06)]',
  },
  red: {
    iconBg: 'bg-accent-red/10 border-accent-red/20',
    iconText: 'text-accent-red',
    hoverBorder: 'hover:border-accent-red/30',
    glow: 'hover:shadow-[0_0_30px_rgba(248,113,113,0.06)]',
  },
}

export default function LandingPage() {
  const { isSignedIn } = useAuth()

  return (
    <div className="min-h-screen bg-bg-primary overflow-hidden">
      {/* Layered background: radial glow + dot grid */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(226,164,59,0.07),transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(96,165,250,0.03),transparent_50%)]" />
        <div
          className="absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage: 'radial-gradient(circle, #333338 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />
      </div>

      {/* Nav */}
      <header className="sticky top-0 z-30 border-b border-border-subtle px-6 py-4 flex items-center justify-between bg-bg-primary/80 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <svg width="20" height="20" viewBox="0 0 32 32" fill="none">
            <path d="M16 4L26 16L16 28L6 16Z" stroke="#e2a43b" strokeWidth="1.5" fill="rgba(226,164,59,0.1)" />
            <path d="M16 10L21 16L16 22L11 16Z" fill="#e2a43b" />
            <path d="M26 16h4M2 12h6M2 20h6" stroke="#e2a43b" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
          </svg>
          <span className="font-semibold text-text-primary text-sm tracking-[0.15em] font-(family-name:--font-dm-sans)">
            LUMEN
          </span>
        </div>
        {isSignedIn ? (
          <div className="flex items-center gap-3">
            <Link
              href="/research"
              className="text-xs bg-accent-amber text-bg-primary px-4 py-1.5 rounded-lg font-medium hover:shadow-[0_0_24px_rgba(226,164,59,0.25)] transition-all duration-300 font-(family-name:--font-dm-sans)"
            >
              Go to Research
            </Link>
            <UserButton />
          </div>
        ) : (
          <SignInButton mode="modal">
            <button className="text-xs text-text-secondary hover:text-accent-amber transition-colors font-(family-name:--font-dm-mono)">
              Sign in
            </button>
          </SignInButton>
        )}
      </header>

      <main className="relative z-10 max-w-5xl mx-auto px-6 pt-20 pb-24">

        {/* ───── Hero ───── */}
        <motion.div
          className="text-center"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent-amber/10 border border-accent-amber/20 mb-6">
            <div className="w-1.5 h-1.5 rounded-full bg-accent-amber animate-pulse" />
            <span className="text-[10px] text-accent-amber font-(family-name:--font-dm-mono)">Agentic AI Research Pipeline</span>
          </div>
          <h1 className="text-4xl sm:text-6xl font-bold text-text-primary font-(family-name:--font-dm-sans) leading-[1.1] tracking-tight">
            Research that
            <br />
            <span className="bg-linear-to-r from-accent-amber via-[#f0c866] to-accent-amber bg-clip-text text-transparent">
              improves itself
            </span>
          </h1>
          <p className="mt-5 text-sm sm:text-base text-text-secondary font-(family-name:--font-dm-sans) max-w-xl mx-auto leading-relaxed">
            Lumen searches the web, synthesises sources, writes structured articles — then critiques its own work and iterates until quality meets the bar.
          </p>

          <div className="mt-8 flex justify-center">
            {isSignedIn ? (
              <Link
                href="/research"
                className="bg-accent-amber text-bg-primary px-8 py-3 rounded-lg text-sm font-medium transition-all duration-300 font-(family-name:--font-dm-sans) hover:shadow-[0_0_40px_rgba(226,164,59,0.3)]"
              >
                Start Researching
              </Link>
            ) : (
              <SignInButton mode="modal">
                <button className="bg-accent-amber text-bg-primary px-8 py-3 rounded-lg text-sm font-medium transition-all duration-300 font-(family-name:--font-dm-sans) hover:shadow-[0_0_40px_rgba(226,164,59,0.3)]">
                  Get Started
                </button>
              </SignInButton>
            )}
          </div>
        </motion.div>

        {/* ───── Mock App Preview ───── */}
        <motion.div
          className="mt-16 relative"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* Ambient glow behind the preview */}
          <div className="absolute -inset-4 bg-[radial-gradient(ellipse_at_center,rgba(226,164,59,0.08),transparent_70%)] rounded-3xl blur-xl" />

          <div className="relative rounded-xl bg-bg-surface border border-border-subtle overflow-hidden shadow-[0_20px_80px_-12px_rgba(0,0,0,0.5)]">
            {/* Mock browser chrome */}
            <div className="px-4 py-2.5 border-b border-border-subtle flex items-center gap-3 bg-bg-primary/50">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-accent-red/60" />
                <div className="w-2.5 h-2.5 rounded-full bg-accent-amber/60" />
                <div className="w-2.5 h-2.5 rounded-full bg-accent-emerald/60" />
              </div>
              <div className="flex-1 flex justify-center">
                <div className="bg-bg-elevated rounded-md px-14 py-1.5" />
              </div>
              <div className="w-[54px]" />
            </div>

            {/* Mock search bar */}
            <div className="px-5 py-3 border-b border-border-subtle">
              <div className="flex items-center gap-3">
                <div className="px-3 py-1.5 rounded-lg bg-bg-elevated border border-border-subtle text-[10px] text-text-muted font-(family-name:--font-dm-mono)">
                  General Research
                </div>
                <div className="flex-1 h-9 bg-bg-elevated border border-border-default rounded-lg px-4 flex items-center">
                  <span className="text-xs text-text-secondary font-(family-name:--font-dm-sans)">
                    How AI agents are transforming software development...
                  </span>
                </div>
                <div className="px-4 py-1.5 rounded-lg bg-accent-amber text-bg-primary text-xs font-medium font-(family-name:--font-dm-sans)">
                  Research
                </div>
              </div>
            </div>

            {/* Mock pipeline stepper */}
            <div className="px-5 py-4 border-b border-border-subtle">
              <div className="flex items-center justify-between max-w-lg mx-auto">
                {PIPELINE_STEPS.map((step, i) => (
                  <div key={step.name} className="flex items-center flex-1 last:flex-none">
                    <div className="flex flex-col items-center gap-1">
                      <motion.div
                        className={`w-6 h-6 rounded-full flex items-center justify-center ${
                          step.status === 'complete' ? 'bg-accent-emerald' :
                          step.status === 'running' ? 'bg-accent-amber' :
                          'border border-border-default bg-bg-elevated'
                        }`}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.5 + i * 0.12, type: 'spring', stiffness: 300 }}
                      >
                        {step.status === 'complete' && (
                          <svg className="w-3 h-3 text-bg-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                        {step.status === 'running' && (
                          <div className="w-1.5 h-1.5 rounded-full bg-bg-primary animate-pulse" />
                        )}
                      </motion.div>
                      <span className="text-[8px] text-text-muted font-(family-name:--font-dm-mono)">{step.name}</span>
                    </div>
                    {i < PIPELINE_STEPS.length - 1 && (
                      <div className={`flex-1 h-px mx-1 mb-4 ${
                        step.status === 'complete' ? 'bg-accent-emerald/50' : 'bg-border-default'
                      }`} />
                    )}
                  </div>
                ))}
              </div>
              <motion.div
                className="mt-2 mx-auto max-w-lg px-3 py-2 rounded-lg bg-bg-elevated border border-border-subtle"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.2 }}
              >
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-accent-amber animate-pulse" />
                  <span className="text-[10px] text-accent-amber font-medium font-(family-name:--font-dm-sans)">Drafter</span>
                  <span className="text-[10px] text-text-muted font-(family-name:--font-dm-mono)">Writing structured article from research...</span>
                </div>
              </motion.div>
            </div>

            {/* Mock article with scores */}
            <div className="px-5 py-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-text-muted uppercase tracking-wider font-(family-name:--font-dm-mono)">Scores</span>
                  {MOCK_SCORES.map(s => (
                    <div key={s.label} className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-bg-elevated border border-border-subtle">
                      <div className={`w-1.5 h-1.5 rounded-full ${s.color}`} />
                      <span className="text-[9px] text-text-muted font-(family-name:--font-dm-mono)">{s.label}</span>
                      <span className="text-[9px] text-text-primary font-medium font-(family-name:--font-dm-mono)">{s.value}/5</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-2.5">
                <div className="h-5 bg-bg-elevated rounded-md w-3/4" />
                <div className="h-3 bg-bg-elevated/50 rounded w-full" />
                <div className="h-3 bg-bg-elevated/50 rounded w-5/6" />
                <div className="h-3 bg-bg-elevated/50 rounded w-full" />
                <div className="h-3 bg-bg-elevated/50 rounded w-2/3" />
              </div>
            </div>
          </div>
        </motion.div>

        {/* ───── How It Works ───── */}
        <motion.div
          className="mt-28"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.5 }}
        >
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-text-primary font-(family-name:--font-dm-sans) tracking-tight">
              Six nodes. One loop.
            </h2>
            <p className="mt-3 text-sm text-text-secondary font-(family-name:--font-dm-sans) max-w-lg mx-auto">
              Each research run flows through a pipeline that plans, searches, summarises, outlines, drafts — then reflects and decides whether to accept or revise.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {FEATURES.map((feature, i) => {
              const style = ACCENT_STYLES[feature.accent]
              return (
                <motion.div
                  key={feature.title}
                  className={`group relative px-5 py-5 rounded-xl bg-bg-surface border border-border-subtle transition-all duration-300 ${style.hoverBorder} ${style.glow}`}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-40px' }}
                  transition={{ duration: 0.4, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                >
                  <div className={`w-9 h-9 rounded-lg ${style.iconBg} border flex items-center justify-center ${style.iconText} mb-3`}>
                    {feature.icon}
                  </div>
                  <h3 className="text-sm font-semibold text-text-primary font-(family-name:--font-dm-sans)">
                    {feature.title}
                  </h3>
                  <p className="text-[12px] text-text-muted mt-1.5 font-(family-name:--font-dm-mono) leading-relaxed">
                    {feature.description}
                  </p>
                </motion.div>
              )
            })}
          </div>
        </motion.div>

        {/* ───── Eval Dashboard ───── */}
        <motion.div
          className="mt-28"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.5 }}
        >
          <div className="text-center mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold text-text-primary font-(family-name:--font-dm-sans) tracking-tight">
              Every run is scored
            </h2>
            <p className="mt-3 text-sm text-text-secondary font-(family-name:--font-dm-sans) max-w-lg mx-auto">
              An LLM judge evaluates each article on quality, relevance, and groundedness. Regressions are flagged automatically so you catch them before users do.
            </p>
          </div>

          <div className="rounded-xl bg-bg-surface border border-border-subtle overflow-hidden">
            <div className="px-5 py-4 border-b border-border-subtle">
              <p className="text-[10px] text-text-muted uppercase tracking-[0.15em] font-(family-name:--font-dm-mono) mb-3">Score Trends</p>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={MOCK_CHART_DATA}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis dataKey="date" tick={{ fill: '#737373', fontSize: 9 }} stroke="#333338" />
                  <YAxis domain={[0, 5]} tick={{ fill: '#737373', fontSize: 9 }} stroke="#333338" />
                  <Legend wrapperStyle={{ fontSize: '9px', color: '#a3a3a3' }} />
                  <Line type="monotone" dataKey="quality" stroke="#34d399" strokeWidth={2} dot={{ r: 2.5, fill: '#34d399' }} />
                  <Line type="monotone" dataKey="relevance" stroke="#e2a43b" strokeWidth={2} dot={{ r: 2.5, fill: '#e2a43b' }} />
                  <Line type="monotone" dataKey="groundedness" stroke="#60a5fa" strokeWidth={2} dot={{ r: 2.5, fill: '#60a5fa' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="px-5 py-3">
              <table className="w-full">
                <thead>
                  <tr className="text-[9px] text-text-muted uppercase tracking-wider font-(family-name:--font-dm-mono)">
                    <th className="text-left py-1.5">Topic</th>
                    <th className="text-right py-1.5">Quality</th>
                    <th className="text-right py-1.5">Relevance</th>
                    <th className="text-right py-1.5">Grounded</th>
                    <th className="text-right py-1.5">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {MOCK_EVALS.map((row, i) => (
                    <motion.tr
                      key={i}
                      className="border-t border-border-subtle/50 text-[10px] font-(family-name:--font-dm-mono)"
                      initial={{ opacity: 0, x: -8 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.08 }}
                    >
                      <td className="py-2 text-text-secondary max-w-[200px] truncate">{row.topic}</td>
                      <td className="py-2 text-right text-accent-emerald">{row.quality}</td>
                      <td className="py-2 text-right text-accent-amber">{row.relevance}</td>
                      <td className="py-2 text-right text-accent-blue">{row.grounded}</td>
                      <td className="py-2 text-right text-text-muted">{row.date}</td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </motion.div>

        {/* ───── Closing CTA ───── */}
        <motion.div
          className="mt-28 text-center"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.5 }}
        >
          <div className="relative inline-block">
            <div className="absolute -inset-8 bg-[radial-gradient(ellipse_at_center,rgba(226,164,59,0.06),transparent_70%)] rounded-full blur-lg" />
            <h2 className="relative text-xl sm:text-2xl font-bold text-text-primary font-(family-name:--font-dm-sans) tracking-tight">
              Try it with your own topic
            </h2>
          </div>
          <p className="mt-3 text-sm text-text-muted font-(family-name:--font-dm-sans)">
            Bring your own API key. No usage caps on our end.
          </p>
          <div className="mt-6">
            {isSignedIn ? (
              <Link
                href="/research"
                className="inline-block bg-accent-amber text-bg-primary px-8 py-3 rounded-lg text-sm font-medium hover:shadow-[0_0_40px_rgba(226,164,59,0.3)] transition-all duration-300 font-(family-name:--font-dm-sans)"
              >
                Start Researching
              </Link>
            ) : (
              <SignInButton mode="modal">
                <button className="bg-accent-amber text-bg-primary px-8 py-3 rounded-lg text-sm font-medium hover:shadow-[0_0_40px_rgba(226,164,59,0.3)] transition-all duration-300 font-(family-name:--font-dm-sans)">
                  Get Started
                </button>
              </SignInButton>
            )}
          </div>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border-subtle px-6 py-5 text-center">
        <p className="text-[10px] text-text-muted font-(family-name:--font-dm-mono)">
          © {new Date().getFullYear()} Lumen — AI-powered deep research agent
        </p>
      </footer>
    </div>
  )
}
