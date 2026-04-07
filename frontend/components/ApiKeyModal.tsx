'use client'
import { useState, useEffect } from 'react'
import { motion } from 'motion/react'
import type { ApiKeys, LLMProvider } from '@/lib/api'
import { fetchProviders } from '@/lib/api'

interface ApiKeyModalProps {
  title?: string
  message: string
  onSubmit: (keys: ApiKeys) => void
  onDismiss?: () => void
  initialProvider?: string
}

export default function ApiKeyModal({ title = 'Welcome to Lumen', message, onSubmit, onDismiss, initialProvider }: ApiKeyModalProps) {
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [providers, setProviders] = useState<LLMProvider[]>([
    { id: 'anthropic', label: 'Anthropic (Claude)', key_prefix: 'sk-ant-', key_url: 'https://console.anthropic.com/' },
  ])
  const [selectedProvider, setSelectedProvider] = useState(initialProvider ?? 'anthropic')

  useEffect(() => {
    fetchProviders().then(setProviders).catch(() => {})
  }, [])

  useEffect(() => {
    if (initialProvider) setSelectedProvider(initialProvider)
  }, [initialProvider])

  const currentProvider = providers.find(p => p.id === selectedProvider) ?? providers[0]
  const canSubmit = apiKey.trim().length > 10

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (canSubmit) {
      onSubmit({ anthropic_api_key: apiKey.trim(), provider: selectedProvider })
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
        className="surface w-full max-w-md mx-4 overflow-hidden"
        initial={{ scale: 0.95, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 10 }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      >
        {/* Header with gradient accent */}
        <div className="relative px-6 pt-6 pb-4">
          <div className="absolute top-0 left-0 right-0 h-1 bg-linear-to-r from-accent-amber via-accent-emerald to-accent-blue" />

          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent-amber/10 border border-accent-amber/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-accent-amber" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                </svg>
              </div>
              <div>
                <h2 className="text-sm font-semibold text-text-primary font-(family-name:--font-dm-sans)">
                  {title}
                </h2>
                <p className="text-[11px] text-text-muted mt-0.5 font-(family-name:--font-dm-mono)">
                  {message}
                </p>
              </div>
            </div>
            {onDismiss && (
              <button
                onClick={onDismiss}
                className="text-text-muted hover:text-text-primary transition-colors p-1 -mt-1 -mr-1"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* How it works */}
        <div className="px-6 pb-4">
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-bg-elevated rounded-lg p-2.5 border border-border-subtle text-center">
              <div className="w-6 h-6 rounded-full bg-accent-amber/10 border border-accent-amber/20 flex items-center justify-center mx-auto mb-1.5">
                <span className="text-[9px] font-bold text-accent-amber font-(family-name:--font-dm-mono)">1</span>
              </div>
              <p className="text-[9px] text-text-muted font-(family-name:--font-dm-mono) leading-tight">
                Pick a provider
              </p>
            </div>
            <div className="bg-bg-elevated rounded-lg p-2.5 border border-border-subtle text-center">
              <div className="w-6 h-6 rounded-full bg-accent-emerald/10 border border-accent-emerald/20 flex items-center justify-center mx-auto mb-1.5">
                <span className="text-[9px] font-bold text-accent-emerald font-(family-name:--font-dm-mono)">2</span>
              </div>
              <p className="text-[9px] text-text-muted font-(family-name:--font-dm-mono) leading-tight">
                Paste your API key
              </p>
            </div>
            <div className="bg-bg-elevated rounded-lg p-2.5 border border-border-subtle text-center">
              <div className="w-6 h-6 rounded-full bg-accent-blue/10 border border-accent-blue/20 flex items-center justify-center mx-auto mb-1.5">
                <span className="text-[9px] font-bold text-accent-blue font-(family-name:--font-dm-mono)">3</span>
              </div>
              <p className="text-[9px] text-text-muted font-(family-name:--font-dm-mono) leading-tight">
                Research any topic
              </p>
            </div>
          </div>
        </div>

        {/* Provider selector + Key input */}
        <form onSubmit={handleSubmit} className="px-6 pb-4">
          {/* Provider pills */}
          <label className="text-[10px] text-text-muted uppercase tracking-wider font-(family-name:--font-dm-mono) mb-1.5 block">
            LLM Provider
          </label>
          <div className="flex gap-1.5 mb-3">
            {providers.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => { setSelectedProvider(p.id); setApiKey('') }}
                className={`flex-1 text-[10px] px-2.5 py-1.5 rounded-md border font-(family-name:--font-dm-mono) transition-all duration-200 ${
                  selectedProvider === p.id
                    ? 'border-accent-amber/50 bg-accent-amber/10 text-accent-amber'
                    : 'border-border-subtle bg-bg-elevated text-text-muted hover:text-text-secondary hover:border-border-default'
                }`}
              >
                {p.label.split(' ')[0]}
              </button>
            ))}
          </div>

          {/* Key input */}
          <label className="text-[10px] text-text-muted uppercase tracking-wider font-(family-name:--font-dm-mono) mb-1.5 block">
            {currentProvider.label} API Key
          </label>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={`${currentProvider.key_prefix}...`}
              autoFocus
              className="w-full h-10 bg-bg-primary border border-border-default rounded-lg pl-3 pr-10 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-amber/40 focus:border-accent-amber/40 font-(family-name:--font-dm-mono)"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
            >
              {showKey ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              )}
            </button>
          </div>

          <div className="flex gap-2 mt-3">
            <button
              type="submit"
              disabled={!canSubmit}
              className="flex-1 h-10 rounded-lg text-xs font-medium bg-accent-amber text-bg-primary hover:shadow-[0_0_24px_rgba(226,164,59,0.25)] disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-300 font-(family-name:--font-dm-sans)"
            >
              Start Researching
            </button>
            {onDismiss && (
              <button
                type="button"
                onClick={onDismiss}
                className="h-10 px-4 rounded-lg text-xs text-text-muted hover:text-text-primary bg-bg-elevated border border-border-subtle hover:border-border-default transition-all duration-200 font-(family-name:--font-dm-sans)"
              >
                Cancel
              </button>
            )}
          </div>
        </form>

        {/* Footer */}
        <div className="px-6 py-3 bg-bg-elevated/50 border-t border-border-subtle flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <svg className="w-3 h-3 text-accent-emerald" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
            <span className="text-[9px] text-text-muted font-(family-name:--font-dm-mono)">
              Encrypted at rest — decrypted per-request only
            </span>
          </div>
          <a
            href={currentProvider.key_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[9px] text-text-muted hover:text-accent-amber transition-colors font-(family-name:--font-dm-mono) flex items-center gap-1"
          >
            Get a key
            <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
          </a>
        </div>
      </motion.div>
    </motion.div>
  )
}
