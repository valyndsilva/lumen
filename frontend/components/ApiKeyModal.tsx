'use client'
import { useState } from 'react'
import { motion } from 'motion/react'
import type { ApiKeys } from '@/lib/api'

interface ApiKeyModalProps {
  message: string
  onSubmit: (keys: ApiKeys) => void
  onDismiss: () => void
}

export default function ApiKeyModal({ message, onSubmit, onDismiss }: ApiKeyModalProps) {
  const [anthropicKey, setAnthropicKey] = useState('')

  const canSubmit = anthropicKey.trim().startsWith('sk-')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (canSubmit) {
      onSubmit({
        anthropic_api_key: anthropicKey.trim(),
      })
    }
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="surface w-full max-w-md mx-4 p-6"
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-text-primary font-(family-name:--font-dm-sans)">
              Usage Limit Reached
            </h2>
            <p className="text-[12px] text-text-muted mt-1 font-(family-name:--font-dm-mono) leading-relaxed">
              {message}
            </p>
          </div>
          <button
            onClick={onDismiss}
            className="text-text-muted hover:text-text-primary transition-colors p-1"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="bg-bg-elevated rounded-lg p-3 mb-4 border border-border-subtle">
          <div className="flex items-center gap-2 mb-1">
            <svg className="w-3.5 h-3.5 text-accent-amber shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v.01M12 9v3m-7 4h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2z" />
            </svg>
            <span className="text-[11px] text-text-secondary font-(family-name:--font-dm-sans) font-medium">
              Your key is never stored
            </span>
          </div>
          <p className="text-[10px] text-text-muted font-(family-name:--font-dm-mono) leading-relaxed">
            Your key is sent per-request and used only for this session. It is not logged, persisted, or sent to any third party.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-[11px] text-text-muted uppercase tracking-wider font-(family-name:--font-dm-mono) mb-1.5 block">
              Anthropic API Key
            </label>
            <input
              type="password"
              value={anthropicKey}
              onChange={(e) => setAnthropicKey(e.target.value)}
              placeholder="sk-ant-..."
              className="w-full h-9 bg-bg-primary border border-border-default rounded-lg px-3 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-amber/40 focus:border-accent-amber/40 font-(family-name:--font-dm-mono)"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={!canSubmit}
              className="flex-1 h-9 rounded-lg text-xs font-medium bg-accent-amber text-bg-primary hover:shadow-[0_0_24px_rgba(226,164,59,0.25)] disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-300 font-(family-name:--font-dm-sans)"
            >
              Continue with my key
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="h-9 px-4 rounded-lg text-xs text-text-muted hover:text-text-primary bg-bg-elevated border border-border-subtle hover:border-border-default transition-all duration-200 font-(family-name:--font-dm-sans)"
            >
              Cancel
            </button>
          </div>
        </form>

        <div className="mt-3 flex justify-center">
          <a
            href="https://console.anthropic.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-text-muted hover:text-accent-amber transition-colors font-(family-name:--font-dm-mono)"
          >
            Get an Anthropic API key
          </a>
        </div>
      </motion.div>
    </motion.div>
  )
}
