'use client'

import React, { useState, useEffect } from 'react'
import { TokenInfo } from '../lib/types'
import { TokenSearch } from './TokenSearch'
import { PriceService } from '@/lib/services/PriceService'

interface TrackProps {
  onTokenSelect: (token: TokenInfo) => void
}

interface TrackedToken extends TokenInfo {
  currentPrice?: number | null
  price?: number | null
  priceChange24h?: number | null
  volume24hUSD?: number | null
  marketCap?: number | null
  fdv?: number | null
  liquidity?: number | null
}

const STORAGE_KEY = 'tracked-tokens'

export function Track({ onTokenSelect }: TrackProps) {
  const [trackedTokens, setTrackedTokens] = useState<TrackedToken[]>([])
  const [showSearch, setShowSearch] = useState(false)
  const [isLoadingPrices, setIsLoadingPrices] = useState(false)

  // Load tracked tokens from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(STORAGE_KEY)
        if (stored) {
          const parsed = JSON.parse(stored)
          if (Array.isArray(parsed) && parsed.length > 0) {
            setTrackedTokens(parsed)
          }
        }
      } catch (e) {
        console.warn('Failed to load tracked tokens:', e)
      }
    }
  }, [])

  // Save tracked tokens to localStorage whenever they change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(trackedTokens))
      } catch (e) {
        console.warn('Failed to save tracked tokens:', e)
      }
    }
  }, [trackedTokens])

  // Fetch market data for tracked tokens
  useEffect(() => {
    if (trackedTokens.length === 0) return
    
    const fetchMarketData = async () => {
      setIsLoadingPrices(true)
      try {
        const addresses = trackedTokens.map(t => t.address).join(',')
        
        // Fetch market data from our API endpoint
        const response = await fetch(`/api/tokens/market-data?addresses=${addresses}`)
        
        if (response.ok) {
          interface MarketDataToken {
            address: string
            currentPrice?: number | null
            priceChange24h?: number | null
            volume24hUSD?: number | null
            marketCap?: number | null
            liquidity?: number | null
          }
          
          const data = await response.json() as { tokens?: MarketDataToken[] }
          const marketDataMap = new Map<string, MarketDataToken>(
            (data.tokens || []).map((token) => [token.address, token])
          )
          
          // Update tracked tokens with market data
          setTrackedTokens(prev => prev.map(token => {
            const marketData = marketDataMap.get(token.address)
            if (marketData) {
              return {
                ...token,
                currentPrice: marketData.currentPrice ?? null,
                price: marketData.currentPrice ?? null,
                priceChange24h: marketData.priceChange24h ?? null,
                volume24hUSD: marketData.volume24hUSD ?? null,
                marketCap: marketData.marketCap ?? null,
                liquidity: marketData.liquidity ?? null
              }
            }
            return token
          }))
        } else {
          // Fallback to price service if API fails
          console.warn('Market data API failed, falling back to price service')
          const priceService = PriceService.getInstance()
          const prices = await priceService.fetchPricesForAddresses(trackedTokens.map(t => t.address))
          setTrackedTokens(prev => prev.map(token => ({
            ...token,
            price: prices.get(token.address) || null,
            currentPrice: prices.get(token.address) || null
          })))
        }
      } catch (error) {
        console.error('Error fetching market data for tracked tokens:', error)
        // Fallback to price service
        try {
          const priceService = PriceService.getInstance()
          const prices = await priceService.fetchPricesForAddresses(trackedTokens.map(t => t.address))
          setTrackedTokens(prev => prev.map(token => ({
            ...token,
            price: prices.get(token.address) || null,
            currentPrice: prices.get(token.address) || null
          })))
        } catch (priceError) {
          console.error('Price service fallback also failed:', priceError)
        }
      } finally {
        setIsLoadingPrices(false)
      }
    }

    fetchMarketData()
    // Refresh market data every 30 seconds
    const interval = setInterval(fetchMarketData, 30000)
    return () => clearInterval(interval)
  }, [trackedTokens.length]) // Re-fetch when token count changes

  const handleAddToken = (token: TokenInfo) => {
    // Check if token is already tracked
    if (trackedTokens.some(t => t.address === token.address)) {
      return
    }

    // Add token to tracked list (no limit)
    setTrackedTokens(prev => [...prev, token as TrackedToken])
    setShowSearch(false)
  }

  const handleRemoveToken = (address: string) => {
    setTrackedTokens(prev => prev.filter(t => t.address !== address))
  }

  const formatNumber = (num: number | null | undefined): string => {
    if (num === null || num === undefined) return '-'
    if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`
    if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`
    if (num >= 1e3) return `$${(num / 1e3).toFixed(2)}K`
    return `$${num.toFixed(2)}`
  }

  if (showSearch) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-4 pt-4 pb-3 border-b border-gray-800 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Add Token to Track</h2>
          <button
            onClick={() => setShowSearch(false)}
            className="px-3 py-1.5 text-sm text-gray-400 hover:text-white"
          >
            Cancel
          </button>
        </div>
        <div className="flex-1 min-h-0">
          <TokenSearch onTokenSelect={handleAddToken} />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-gray-800">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">
            Tracked Tokens ({trackedTokens.length})
          </h2>
          <button
            onClick={() => setShowSearch(true)}
            className="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700"
          >
            + Add Token
          </button>
        </div>
      </div>

      {/* Tracked Tokens List */}
      <div className="flex-1 overflow-y-auto px-4 pt-4">
        {trackedTokens.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="mb-2">No tracked tokens yet</p>
            <p className="text-sm">Click "Add Token" to start tracking tokens</p>
          </div>
        ) : (
          <div className="space-y-1 pb-4">
            {trackedTokens.map((token) => {
              const isVerified = token.tags?.includes('verified') || token.tags?.includes('strict')
              const price = token.currentPrice ?? token.price
              const priceChange = token.priceChange24h
              const volume = token.volume24hUSD
              const marketCap = token.marketCap
              const liquidity = token.liquidity
              
              return (
                <div
                  key={token.address}
                  className="w-full flex items-center gap-3 p-3 bg-[#1e1f2e] hover:bg-[#2a2b3a] rounded-lg transition-colors"
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

                  {/* Token Info - Clickable */}
                  <button
                    onClick={() => onTokenSelect(token)}
                    className="flex-1 min-w-0 text-left"
                  >
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
                    {/* Market Data - Same as Terminal */}
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
                      {isLoadingPrices && !price && (
                        <span className="text-gray-500">Loading...</span>
                      )}
                    </div>
                  </button>

                  {/* Remove Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleRemoveToken(token.address)
                    }}
                    className="flex-shrink-0 p-2 text-gray-500 hover:text-red-500 transition-colors"
                    aria-label="Remove token"
                  >
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
