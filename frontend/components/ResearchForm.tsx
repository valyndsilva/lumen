'use client'
import { useState, useEffect } from 'react'
import type { Domain } from '@/lib/api'

const TOPIC_POOL: Record<string, { label: string; topic: string }[]> = {
  general: [
    { label: 'AI Agents', topic: 'How AI agents and agentic systems are transforming software development and business automation in 2025-2026' },
    { label: 'Vibe Coding', topic: 'What is vibe coding and how are developers using AI to generate code from natural language prompts' },
    { label: 'Model Context Protocol', topic: 'What is MCP Model Context Protocol and why is it becoming the standard for connecting AI models to tools and data' },
    { label: 'DeepSeek Open AI', topic: 'How DeepSeek open-source AI models are challenging OpenAI and reshaping the competitive landscape in 2025-2026' },
    { label: 'AI Replacing Jobs', topic: 'Which jobs are most at risk from AI automation in 2025-2026 and how is the labor market adapting' },
    { label: 'Humanoid Robots', topic: 'How humanoid robots from Figure Tesla and 1X are moving from prototypes to production in 2025-2026' },
    { label: 'Quantum Computing', topic: 'IBM quantum computing milestone 2026 outperforming classical computers and practical applications' },
    { label: 'AI Code Editors', topic: 'Cursor vs GitHub Copilot vs Windsurf comparison of AI-powered code editors and their impact on development' },
    { label: 'Small Language Models', topic: 'How smaller efficient AI models are outperforming large models for domain-specific tasks in 2025-2026' },
    { label: 'AI Energy Demand', topic: 'How much electricity do AI data centers consume and the growing energy crisis from AI infrastructure buildout' },
    { label: 'Multimodal AI', topic: 'How multimodal AI models that combine text vision and audio are changing applications in 2025-2026' },
    { label: 'Open Source vs Closed', topic: 'Why open source AI models are challenging proprietary ones and what it means for the industry' },
  ],
  medical: [
    { label: 'GLP-1 Drug Expansion', topic: 'How GLP-1 drugs like Ozempic and Mounjaro are being used beyond weight loss for heart failure addiction and other conditions' },
    { label: 'Bird Flu Outbreak', topic: 'H5N1 bird flu spread through US dairy cattle and poultry and the risk of human pandemic in 2025-2026' },
    { label: 'Cancer Vaccines', topic: 'Personalized mRNA cancer vaccines for melanoma and solid tumors clinical trial results and timeline for approval' },
    { label: 'CRISPR Gene Therapy', topic: 'First customized CRISPR gene therapy treatments in humans and breakthroughs in genetic disease cures 2025-2026' },
    { label: 'Brain-Computer Interfaces', topic: 'Neuralink and brain-computer interface advances in 2025-2026 for paralysis depression and mental health treatment' },
    { label: 'Longevity Medicine', topic: 'Anti-aging and longevity medicine breakthroughs in 2025-2026 including senolytics rapamycin and biological age reversal' },
    { label: 'Gut Microbiome', topic: 'How gut microbiome research is revealing links to obesity brain aging and metabolic disease treatment in 2025-2026' },
    { label: 'CAR-T Cell Therapy', topic: 'CAR-T cell therapy advances for blood cancers and solid tumors and new immunotherapy combinations 2025-2026' },
    { label: 'Alzheimer Treatments', topic: 'New Alzheimer disease treatments and drugs in 2025-2026 including lecanemab donanemab and emerging therapies' },
    { label: 'AI Drug Discovery', topic: 'How artificial intelligence is accelerating drug discovery and reducing pharmaceutical development timelines in 2025-2026' },
    { label: 'Psychedelic Therapy', topic: 'Psilocybin-assisted therapy treatment-resistant depression clinical trials and FDA approval path' },
    { label: 'Vaccine Hesitancy', topic: 'Rising vaccine hesitancy and preventable disease outbreaks measles pertussis amid declining vaccination rates 2025-2026' },
  ],
  legal: [
    { label: 'AI Regulation', topic: 'How the EU AI Act and US state laws are creating a patchwork of AI regulations for businesses in 2025-2026' },
    { label: 'Google Antitrust', topic: 'Google search monopoly antitrust ruling remedies Chrome divestiture appeal and impact on competition 2025-2026' },
    { label: 'Deepfake Laws', topic: 'State and federal deepfake legislation TAKE IT DOWN Act and DEFIANCE Act regulating synthetic media in 2025-2026' },
    { label: 'AI Copyright', topic: 'NYT vs OpenAI and Getty vs Stability AI lawsuits over AI training on copyrighted content and fair use rulings' },
    { label: 'Data Privacy Laws', topic: 'New state and federal data privacy laws taking effect in 2025-2026 and their impact on businesses and consumers' },
    { label: 'Crypto Legislation', topic: 'GENIUS Act stablecoin regulation and crypto market structure bills passed by US Congress in 2025-2026' },
    { label: 'Algorithmic Pricing', topic: 'Legal challenges to AI-driven algorithmic pricing tools and new state laws regulating personalized pricing' },
    { label: 'Meta Antitrust', topic: 'FTC vs Meta antitrust case over Instagram WhatsApp acquisitions and what it means for Big Tech regulation' },
    { label: 'TikTok Legal Battle', topic: 'TikTok ban Supreme Court ruling and ongoing legal battles over Chinese ownership divestiture in 2025-2026' },
    { label: 'AI Employment Law', topic: 'Laws regulating AI in hiring employment discrimination and automated decision-making in the workplace 2025-2026' },
    { label: 'Children Online Safety', topic: 'COPPA 2.0 Kids Online Safety Act and new legislation protecting children data and social media use' },
    { label: 'AI Chatbot Safety', topic: 'California SB 243 and new laws regulating AI companion chatbots protecting minors from harmful content' },
  ],
  financial: [
    { label: 'AI Supercycle', topic: 'Is the AI investment boom a bubble or supercycle and what are the market implications for 2025-2026' },
    { label: 'Tariff Impacts', topic: 'How Trump tariffs are affecting US trade inflation supply chains and global markets in 2025-2026' },
    { label: 'Interest Rate Outlook', topic: 'Federal Reserve interest rate path for 2026 after slowing pace of cuts amid sticky inflation' },
    { label: 'Nuclear Energy Stocks', topic: 'Nuclear energy stocks rally and AI data center power demand driving investment in 2025-2026' },
    { label: 'Bitcoin All-Time High', topic: 'Bitcoin price prediction 2026 institutional adoption and new crypto ETFs driving market growth' },
    { label: 'Stablecoin Regulation', topic: 'GENIUS Act stablecoin framework how US regulation is bringing stablecoins into mainstream finance' },
    { label: 'DOGE Spending Cuts', topic: 'Elon Musk DOGE Department of Government Efficiency results federal workforce cuts vs actual spending impact' },
    { label: 'Private Credit Boom', topic: 'Private credit market growth in 2025-2026 as alternative lending replaces traditional bank financing' },
    { label: 'AI Infrastructure Capex', topic: 'How much are hyperscalers spending on AI data center infrastructure and which companies benefit' },
    { label: 'Market Valuations', topic: 'Are US stock market valuations too high in 2026 and what risks do elevated PE ratios pose for investors' },
    { label: 'Magnificent Seven', topic: 'Magnificent Seven tech stocks performance concentration risk and whether the AI trade is broadening in 2026' },
    { label: 'US National Debt', topic: 'US national debt and deficit trajectory in 2025-2026 and impact on bond markets interest rates and fiscal policy' },
  ],
}

const PILLS_MOBILE = 6
const PILLS_DESKTOP = 8

function pickRandom<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, count)
}

interface ResearchFormProps {
  onSubmit: (topic: string) => void
  onCancel?: () => void
  isRunning: boolean
  domains: Domain[]
  selectedDomain: string
  onDomainChange: (domain: string) => void
}

export default function ResearchForm({
  onSubmit, onCancel, isRunning,
  domains, selectedDomain, onDomainChange,
}: ResearchFormProps) {
  const [topic, setTopic] = useState('')

  // Pick random pills from the pool — only on client to avoid hydration mismatch
  const pool = TOPIC_POOL[selectedDomain] ?? TOPIC_POOL.general
  const [pills, setPills] = useState(pool.slice(0, PILLS_DESKTOP))
  useEffect(() => {
    setPills(pickRandom(TOPIC_POOL[selectedDomain] ?? TOPIC_POOL.general, PILLS_DESKTOP))
  }, [selectedDomain])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (topic.trim() && !isRunning) {
      onSubmit(topic.trim())
    }
  }

  return (
    <div className="px-5 pt-4 pb-3">
      <form onSubmit={handleSubmit} className="flex flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-3">
        <select
          value={selectedDomain}
          onChange={(e) => onDomainChange(e.target.value)}
          disabled={isRunning}
          className="shrink-0 h-10 bg-bg-elevated border border-border-default rounded-lg px-3 text-xs text-text-secondary focus:outline-none focus:ring-1 focus:ring-accent-amber/40 focus:border-accent-amber/40 disabled:opacity-40 transition-all duration-300 font-(family-name:--font-dm-mono) appearance-none cursor-pointer"
          style={{ backgroundImage: 'url("data:image/svg+xml,%3csvg xmlns=%27http://www.w3.org/2000/svg%27 fill=%27none%27 viewBox=%270 0 20 20%27%3e%3cpath stroke=%27%23737373%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27 stroke-width=%271.5%27 d=%27M6 8l4 4 4-4%27/%3e%3c/svg%3e")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center', backgroundSize: '16px', paddingRight: '28px' }}
        >
          {domains.map(d => (
            <option key={d.id} value={d.id}>{d.label}</option>
          ))}
        </select>
        <div className="flex-1 relative">
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Enter a research topic..."
            disabled={isRunning}
            className="w-full h-10 bg-bg-elevated border border-border-default rounded-lg px-4 pr-9 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-amber/40 focus:border-accent-amber/40 disabled:opacity-40 transition-all duration-300 font-(family-name:--font-dm-sans)"
          />
          {topic && !isRunning && (
            <button
              type="button"
              onClick={() => setTopic('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        {isRunning ? (
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setTopic('')
              onCancel?.()
            }}
            className="shrink-0 h-10 px-4 rounded-lg text-sm font-medium bg-accent-red/15 text-accent-red border border-accent-red/30 hover:bg-accent-red/25 transition-all duration-300 font-(family-name:--font-dm-sans) flex items-center gap-2"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            Cancel
          </button>
        ) : (
          <button
            type="submit"
            disabled={!topic.trim()}
            className="shrink-0 h-10 px-5 rounded-lg text-sm font-medium bg-accent-amber text-bg-primary hover:shadow-[0_0_24px_rgba(226,164,59,0.25)] disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-300 font-(family-name:--font-dm-sans)"
          >
            Research
          </button>
        )}
      </form>

      {/* Suggested topics (domain-aware) */}
      {!isRunning && !topic.trim() && (
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {pills.map(({ label, topic: t }, i) => (
            <button
              key={t}
              type="button"
              onClick={() => setTopic(t)}
              className={`text-[10px] px-2.5 py-1 rounded-md bg-bg-elevated border border-border-subtle text-text-secondary hover:text-accent-amber hover:border-accent-amber/30 transition-all duration-200 font-(family-name:--font-dm-mono) ${i >= PILLS_MOBILE ? 'hidden lg:inline-block' : ''}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
