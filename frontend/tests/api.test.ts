import { describe, it, expect, beforeEach } from 'vitest'
import { setAuthTokenGetter, getCachedAuthToken } from '@/lib/api'

describe('Auth token management', () => {
  beforeEach(() => {
    setAuthTokenGetter(async () => null)
  })

  it('getCachedAuthToken returns null initially', () => {
    // Before any authHeaders call, cached token should be null
    expect(getCachedAuthToken()).toBeNull()
  })

  it('setAuthTokenGetter accepts a function without error', () => {
    expect(() => setAuthTokenGetter(async () => 'token')).not.toThrow()
  })

  it('setAuthTokenGetter can be called multiple times', () => {
    setAuthTokenGetter(async () => 'first')
    setAuthTokenGetter(async () => 'second')
    // No error — latest getter wins
  })

  it('getCachedAuthToken returns null after setting getter with null return', () => {
    setAuthTokenGetter(async () => null)
    // Token is only cached after authHeaders() is called (private),
    // but getCachedAuthToken reflects the last fetched value
    expect(getCachedAuthToken()).toBeNull()
  })
})
