'use client'

import React, { useState, useEffect } from 'react'
import { TokenInfo, getTokenByMint } from '../lib/types'

interface TokenSearchProps {
  onTokenSelect: (token: TokenInfo) => void
}

interface SearchResult extends TokenInfo {
  logoURI?: string
}

export function TokenSearch({ onTokenSelect }: TokenSearchProps) {
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isLoadingAddress, setIsLoadingAddress] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Check if query looks like a Solana address (base58, typically 32-44 chars)
  const looksLikeAddress = (str: string): boolean => {
    const trimmed = str.trim()
    // Solana addresses are base58 encoded, typically 32-44 characters
    // They don't contain 0, O, I, or l to avoid confusion
    return trimmed.length >= 32 && trimmed.length <= 44 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(trimmed)
  }

  // Handle direct address lookup
  const handleAddressLookup = async (address: string) => {
    setIsLoadingAddress(true)
    setError(null)
    
    try {
      const token = await getTokenByMint(address.trim(), false)
      if (token) {
        onTokenSelect(token)
        setQuery('') // Clear input after selection
      } else {
        setError('Token not found')
      }
    } catch (err) {
      console.error('Address lookup error:', err)
      setError('Failed to look up token address')
    } finally {
      setIsLoadingAddress(false)
    }
  }

  // Search by name via API
  useEffect(() => {
    const trimmedQuery = query.trim()
    
    // If empty, clear results
    if (!trimmedQuery) {
      setSearchResults([])
      setError(null)
      return
    }

    // If it looks like an address, don't search by name
    if (looksLikeAddress(trimmedQuery)) {
      setSearchResults([])
      return
    }

    // Require minimum 2 characters for search
    if (trimmedQuery.length < 2) {
      setSearchResults([])
      setError(null)
      setIsSearching(false)
      return
    }

    // Debounce name search
    const timeoutId = setTimeout(async () => {
      // Double-check query length after debounce (in case it changed)
      const currentQuery = query.trim()
      if (currentQuery.length < 2) {
        setSearchResults([])
        setError(null)
        setIsSearching(false)
        return
      }
      
      setIsSearching(true)
      setError(null)
      
      try {
        const response = await fetch(`/api/tokens/search?q=${encodeURIComponent(currentQuery)}`)
        const data = await response.json()
        
        console.log('Search API response:', {
          status: response.status,
          data: data,
          hasTokens: !!data.tokens,
          tokenCount: data.tokens?.length || 0
        })
        
        if (data.error) {
          console.error('Search API error:', data.error)
          setError(data.error)
          setSearchResults([])
        } else if (data.tokens && Array.isArray(data.tokens)) {
          if (data.tokens.length === 0) {
            setError('No tokens found')
          } else {
            setError(null)
          }
          
          // Map and filter tokens
          const mappedTokens = data.tokens.map((token: any) => {
            // Jupiter API uses 'id' as the mint address field!
            const address = token.address || token.mint || token.mintAddress || token.id
            return {
              address: address,
              symbol: token.symbol || '',
              name: token.name || '',
              decimals: token.decimals || 9,
              tags: token.tags || [],
              logoURI: token.logoURI || token.icon
            }
          }).filter((token: any) => token.address) // Filter out tokens without address
          
          console.log('Mapped tokens in TokenSearch:', {
            originalCount: data.tokens.length,
            afterMapping: mappedTokens.length,
            sampleToken: mappedTokens[0],
            allHaveAddress: mappedTokens.every((t: SearchResult) => t.address)
          })
          
          setSearchResults(mappedTokens)
        } else {
          console.warn('Unexpected response format:', data)
          setError('Unexpected response format')
          setSearchResults([])
        }
      } catch (err) {
        console.error('Search error:', err)
        setError('Failed to search tokens')
        setSearchResults([])
      } finally {
        setIsSearching(false)
      }
    }, 300) // 300ms debounce

    return () => clearTimeout(timeoutId)
  }, [query])

  // Handle form submission (for address paste)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedQuery = query.trim()
    
    if (!trimmedQuery) return

    // If it looks like an address, look it up directly
    if (looksLikeAddress(trimmedQuery)) {
      await handleAddressLookup(trimmedQuery)
    }
    // Otherwise, if there are search results, select the first one
    else if (searchResults.length > 0) {
      onTokenSelect(searchResults[0])
      setQuery('')
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search Input */}
      <div className="px-4 pt-4 pb-4">
        <form onSubmit={handleSubmit}>
          <div className="relative">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Paste token address or search by name..."
              className="w-full px-4 py-3 bg-[#1a1b23] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm"
              disabled={isLoadingAddress}
            />
            {(isSearching || isLoadingAddress) && (
              <div className="absolute right-12 top-1/2 transform -translate-y-1/2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-400"></div>
              </div>
            )}
            <svg
              className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          {error && (
            <div className="mt-2 text-red-500 text-sm">{error}</div>
          )}
          {looksLikeAddress(query.trim()) && !isLoadingAddress && (
            <div className="mt-2 text-blue-400 text-xs">
              Press Enter to look up this address
            </div>
          )}
        </form>
      </div>

      {/* Search Results */}
      {query.trim() && !looksLikeAddress(query.trim()) && (
        <div className="flex-1 overflow-y-auto px-4">
          {isSearching ? (
            <div className="text-center py-8 text-gray-400">
              Searching...
            </div>
          ) : searchResults.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              {error || 'No tokens found'}
            </div>
          ) : (
            <div className="space-y-1 pb-4">
              {searchResults.map((token) => {
                const isVerified = token.tags?.includes('verified') || token.tags?.includes('strict')
                
                // Skip tokens without address
                if (!token.address) {
                  return null
                }
                
                return (
                  <button
                    key={token.address}
                    onClick={() => {
                      onTokenSelect(token)
                      setQuery('')
                    }}
                    className="w-full flex items-center gap-3 p-3 bg-[#1e1f2e] hover:bg-[#2a2b3a] rounded-lg transition-colors text-left"
                  >
                    {/* Token Logo */}
                    <div className="flex-shrink-0">
                      {token.logoURI ? (
                        <img
                          src={token.logoURI}
                          alt={token.symbol}
                          className="w-10 h-10 rounded-full"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none'
                          }}
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center">
                          <span className="text-xs text-gray-400">
                            {token.symbol?.slice(0, 2).toUpperCase() || '??'}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Token Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-white text-sm">
                          {token.symbol || 'Unknown'}
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
                        {token.name || 'Unknown Token'}
                      </div>
                      {token.address && (
                        <div className="text-xs text-gray-500 font-mono truncate">
                          {token.address.slice(0, 8)}...{token.address.slice(-6)}
                        </div>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Instructions when no query */}
      {!query.trim() && (
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center text-gray-400 max-w-sm">
            <p className="mb-2">Search for any token on Jupiter</p>
            <p className="text-sm">• Paste a token address to look it up directly</p>
            <p className="text-sm">• Type a token name to search by name</p>
          </div>
        </div>
      )}
    </div>
  )
}
