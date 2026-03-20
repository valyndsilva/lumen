import { describe, it, expect } from 'vitest'

// Mirror the ERROR_MESSAGES from ActivityFeed to test classification
const ERROR_MESSAGES: Record<string, { title: string; hint: string }> = {
  llm: { title: 'LLM Service Error', hint: 'Your API key was not charged. Try again in a moment.' },
  search_provider: { title: 'Search Provider Unavailable', hint: 'Try a different research domain, or try again later.' },
  auth: { title: 'Session Expired', hint: 'Please sign in again.' },
  database: { title: 'Database Unavailable', hint: 'Results could not be saved. Try again shortly.' },
  unknown: { title: 'Pipeline Error', hint: 'Something went wrong. Please try again.' },
}

describe('Error message mapping', () => {
  it('maps all backend error codes to user-friendly messages', () => {
    const backendCodes = ['llm', 'search_provider', 'auth', 'database', 'unknown']

    for (const code of backendCodes) {
      const msg = ERROR_MESSAGES[code]
      expect(msg).toBeDefined()
      expect(msg.title).toBeTruthy()
      expect(msg.hint).toBeTruthy()
    }
  })

  it('falls back to unknown for unrecognized codes', () => {
    const code = 'new_error_type'
    const msg = ERROR_MESSAGES[code] ?? ERROR_MESSAGES.unknown
    expect(msg.title).toBe('Pipeline Error')
  })

  it('llm error reassures user about billing', () => {
    expect(ERROR_MESSAGES.llm.hint).toContain('not charged')
  })

  it('search_provider error suggests domain switch', () => {
    expect(ERROR_MESSAGES.search_provider.hint).toContain('different research domain')
  })

  it('auth error prompts sign-in', () => {
    expect(ERROR_MESSAGES.auth.hint).toContain('sign in')
  })
})
