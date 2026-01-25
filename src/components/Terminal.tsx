'use client'

import React, { useState, useEffect } from 'react'
import { TokenInfo } from '../lib/types'

interface TerminalProps {
  onTokenSelect: (token: TokenInfo) => void
}

interface TokenWithPrice extends TokenInfo {
  price?: number | null
  currentPrice?: number | null
  priceChange24h?: number | null
  volume24hUSD?: number | null
  marketCap?: number | null
  fdv?: number | null
  liquidity?: number | null
  orderCount?: number
}

// Client-side cache for Terminal tokens (persists across component mounts)
let terminalCache: {
  tokens: TokenWithPrice[]
  timestamp: number
  version?: string // Cache version to invalidate old caches
} | null = null

const CACHE_TTL = 5 * 60 * 1000 // 5 minutes - refresh cache after this time
const STORAGE_KEY = 'terminal-tokens-cache'
const CACHE_VERSION = '2.0' // Increment this to invalidate old caches

// Validate that cached tokens are from cooking endpoint (have market data)
function isValidCookingCache(tokens: TokenWithPrice[]): boolean {
  if (!tokens || tokens.length === 0) return false
  
  // Cooking tokens should have market data (price, volume, etc.)
  // Legacy tokens won't have these fields
  const hasMarketData = tokens.some(token => 
    token.currentPrice !== undefined || 
    token.priceChange24h !== undefined || 
    token.volume24hUSD !== undefined
  )
  
  return hasMarketData
}

// Note: localStorage loading is now done in useEffect to avoid hydration mismatches

// Save cache to localStorage
function saveCacheToStorage(cache: { tokens: TokenWithPrice[], timestamp: number, version?: string }) {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cache))
    } catch (e) {
      console.warn('Terminal: Failed to save cache to localStorage:', e)
    }
  }
}

export function Terminal({ onTokenSelect }: TerminalProps) {
  // Always start with empty state to match SSR (prevents hydration mismatch)
  const [tokens, setTokens] = useState<TokenWithPrice[]>([])
  const [loading, setLoading] = useState(true)

  // Load from cache after component mounts (client-side only)
  useEffect(() => {
    // Check localStorage on client side
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(STORAGE_KEY)
        if (stored) {
          const parsed = JSON.parse(stored)
          const cacheAge = Date.now() - parsed.timestamp
          
          // Validate cache version and structure
          const isValidVersion = parsed.version === CACHE_VERSION || !parsed.version // Allow old caches without version
          const hasValidTokens = parsed.tokens && Array.isArray(parsed.tokens) && parsed.tokens.length > 0
          const isCookingData = isValidCookingCache(parsed.tokens || [])
          
          // Use localStorage cache if it's valid and less than 10 minutes old
          if (cacheAge < 10 * 60 * 1000 && hasValidTokens && isValidVersion && isCookingData) {
            console.log('Terminal: Loaded cache from localStorage (age:', Math.round(cacheAge / 1000), 'seconds)')
            terminalCache = parsed
            setTokens(parsed.tokens)
            setLoading(false)
            
            // If cache is stale (>5 min), refresh in background
            if (cacheAge >= CACHE_TTL) {
              console.log('Terminal: Cache is stale, refreshing in background')
              // Continue to fetch below
            } else {
              // Cache is fresh, we're done
              return
            }
          } else {
            // Invalid cache - clear it
            if (!isCookingData) {
              console.warn('Terminal: Invalid cache detected (legacy tokens without market data), clearing...')
              localStorage.removeItem(STORAGE_KEY)
            } else if (!isValidVersion) {
              console.warn('Terminal: Cache version mismatch, clearing old cache...')
              localStorage.removeItem(STORAGE_KEY)
            }
          }
        }
      } catch (e) {
        console.warn('Terminal: Failed to load cache from localStorage:', e)
        // Clear corrupted cache
        if (typeof window !== 'undefined') {
          localStorage.removeItem(STORAGE_KEY)
        }
      }
    }
    
    // Check if we have fresh in-memory cache
    if (terminalCache) {
      const cacheAge = Date.now() - terminalCache.timestamp
      const isValid = isValidCookingCache(terminalCache.tokens)
      
      if (cacheAge < CACHE_TTL && isValid) {
        console.log('Terminal: Using existing cache, skipping fetch')
        setTokens(terminalCache.tokens)
        setLoading(false)
        return
      } else {
        // Cache is stale or invalid - refresh
        if (!isValid) {
          console.warn('Terminal: Invalid cache in memory, clearing...')
          terminalCache = null
        } else {
          console.log('Terminal: Cache is stale, refreshing in background')
          setTokens(terminalCache.tokens)
          setLoading(false)
          // Continue to fetch below
        }
      }
    }

    console.log('Terminal: Fetching fresh data from /api/tokens/cooking')
    setLoading(true)

    let cancelled = false

    async function fetchTokens() {
      try {
        const response = await fetch('/api/tokens/cooking', {
          cache: 'no-store'
        })
        
        if (!response.ok) {
          throw new Error(`API returned ${response.status}`)
        }
        
        const data = await response.json()
        
        // Don't update state if component was unmounted
        if (cancelled) return
        
        console.log('Terminal: Received data from cooking endpoint:', {
          hasTokens: !!data.tokens,
          tokenCount: data.tokens?.length || 0,
          source: data.source,
          cached: data.cached
        })
        
        // Only set tokens if we have valid data from cooking endpoint
        if (data.tokens && Array.isArray(data.tokens) && data.tokens.length > 0) {
          const mappedTokens = data.tokens.map((token: any) => ({
            address: token.address,
            symbol: token.symbol,
            name: token.name,
            decimals: token.decimals,
            tags: token.tags || [],
            logoURI: token.logoURI,
            currentPrice: token.currentPrice,
            priceChange24h: token.priceChange24h,
            volume24hUSD: token.volume24hUSD,
            marketCap: token.marketCap,
            fdv: token.fdv,
            liquidity: token.liquidity,
            orderCount: token.orderCount || 0
          }))
          
          // Update cache
          terminalCache = {
            tokens: mappedTokens,
            timestamp: Date.now(),
            version: CACHE_VERSION
          }
          
          // Save to localStorage
          saveCacheToStorage(terminalCache)
          
          setTokens(mappedTokens)
        } else {
          console.warn('Cooking endpoint returned no tokens')
          // If we have cached data, keep showing it even if fetch returns empty
          if (!terminalCache) {
            setTokens([])
          }
        }
      } catch (cookingError) {
        console.error('Cooking endpoint failed:', cookingError)
        // If we have cached data, keep showing it even if fetch fails
        if (!terminalCache) {
          setTokens([])
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    fetchTokens()

    // Cleanup: cancel any pending requests if component unmounts
    return () => {
      cancelled = true
    }
  }, []) // Empty deps - only run on mount


  // Always show loading state while fetching
  // This prevents any stale tokens from being displayed
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-400">Loading tokens...</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Token List */}
      <div className="flex-1 overflow-y-auto px-4 pt-4">
        {tokens.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            No tokens available
          </div>
        ) : (
          <div className="space-y-1">
            {tokens.map((token) => {
              const isVerified = token.tags?.includes('verified') || token.tags?.includes('strict')
              const price = token.currentPrice ?? token.price
              const priceChange = token.priceChange24h
              const volume = token.volume24hUSD
              const marketCap = token.marketCap
              const liquidity = token.liquidity
              
              // Format large numbers
              const formatNumber = (num: number | null | undefined): string => {
                if (num === null || num === undefined) return '-'
                if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`
                if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`
                if (num >= 1e3) return `$${(num / 1e3).toFixed(2)}K`
                return `$${num.toFixed(2)}`
              }
              
              return (
                <button
                  key={token.address}
                  onClick={() => onTokenSelect(token)}
                  className="w-full flex items-center gap-3 p-3 bg-[#1e1f2e] hover:bg-[#2a2b3a] rounded-lg transition-colors text-left"
                >
                  {/* Token Logo */}
                  <div className="flex-shrink-0">
                    {token.logoURI ? (
                      <img
                        src={token.logoURI}
                        alt={token.symbol}
                        className="w-10 h-10 rounded-full"
                        loading="lazy"
                        decoding="async"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none'
                        }}
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center">
                        <span className="text-xs text-gray-400">
                          {token.symbol.slice(0, 2).toUpperCase()}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Token Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-white text-sm">
                        {token.symbol}
                      </span>
                      {isVerified && (
                        <svg
                          className="w-4 h-4 text-green-500 flex-shrink-0"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                            clipRule="evenodd"
                          />
                        </svg>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 truncate mb-1">
                      {token.name}
                    </div>
                    {/* Market Data */}
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                      {price !== null && price !== undefined && (
                        <span className="text-gray-300">
                          ${price < 0.01 ? price.toFixed(6) : price.toFixed(4)}
                        </span>
                      )}
                      {priceChange !== null && priceChange !== undefined && (
                        <span className={priceChange >= 0 ? 'text-green-500' : 'text-red-500'}>
                          {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
                        </span>
                      )}
                      {volume !== null && volume !== undefined && (
                        <span className="text-gray-500">
                          Vol: {formatNumber(volume)}
                        </span>
                      )}
                      {marketCap !== null && marketCap !== undefined && (
                        <span className="text-gray-500">
                          MC: {formatNumber(marketCap)}
                        </span>
                      )}
                      {liquidity !== null && liquidity !== undefined && (
                        <span className="text-gray-500">
                          Liq: {formatNumber(liquidity)}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
