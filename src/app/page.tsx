'use client'

import { useState, useEffect, useCallback } from 'react'
import { TokenSection } from '../components/TokenSection'
import { TokenInput } from '../components/TokenInput'
import { TokenInfo } from '../lib/types'
import { PriceService } from '@/lib/services/PriceService'
import { useLimitOrders } from '@/lib/hooks/useLimitOrders'

export default function Home() {
  const [selectedToken, setSelectedToken] = useState<TokenInfo | null>(null)
  const [currentPrice, setCurrentPrice] = useState<number | null>(null)
  const [tokenPrices, setTokenPrices] = useState<Map<string, number>>(new Map())
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [isPriceRefreshing, setPriceRefreshing] = useState(false)
  const [isOrdersRefreshing, setOrdersRefreshing] = useState(false)
  const [isPriceFetching, setIsPriceFetching] = useState(false)

  // Get orders for selected token
  const { orders, loading: ordersLoading, refresh: refreshOrders } = useLimitOrders(
    selectedToken?.address || '',
    autoRefresh
  )

  // Fetch main token price
  const refreshPrice = useCallback(async () => {
    if (!selectedToken) return
    
    try {
      const priceService = PriceService.getInstance()
      const price = await priceService.fetchPrice(selectedToken.address)
      setCurrentPrice(price)
    } catch (error) {
      console.error('Error fetching price:', error)
    }
  }, [selectedToken])

  // Fetch prices for all tokens in orders
  const fetchAllPrices = useCallback(async () => {
    if (!orders || orders.length === 0 || !selectedToken) return

    setIsPriceFetching(true)
    try {
      const priceService = PriceService.getInstance()
      
      // Get unique token addresses from orders
      const uniqueTokens = new Set<string>()
      orders.forEach(order => {
        uniqueTokens.add(order.inputMint.address)
        uniqueTokens.add(order.outputMint.address)
      })

      // Fetch prices for all tokens
      const prices = await priceService.fetchPricesForAddresses(Array.from(uniqueTokens))
      setTokenPrices(prices)
    } finally {
      setIsPriceFetching(false)
    }
  }, [orders, selectedToken])

  // Effect to fetch prices when orders change
  useEffect(() => {
    fetchAllPrices()
  }, [fetchAllPrices])

  // Auto-refresh effect
  useEffect(() => {
    if (!autoRefresh || !selectedToken) return

    refreshPrice()
    const interval = setInterval(refreshPrice, 30000) // Refresh every 30 seconds
    return () => clearInterval(interval)
  }, [autoRefresh, selectedToken, refreshPrice])

  // Initial price fetch when token is selected
  useEffect(() => {
    if (selectedToken) {
      refreshPrice()
    } else {
      setCurrentPrice(null)
      setTokenPrices(new Map())
    }
  }, [selectedToken, refreshPrice])

  const handleTokenSelect = (token: TokenInfo) => {
    console.log('Selected token:', token)
    setSelectedToken(token)
  }

  const handleRefreshPrice = async () => {
    if (!selectedToken) return
    
    setPriceRefreshing(true)
    try {
      await refreshPrice()
    } finally {
      setPriceRefreshing(false)
    }
  }

  const handleRefreshOrders = async () => {
    if (!selectedToken) return
    
    setOrdersRefreshing(true)
    try {
      await refreshOrders()
    } finally {
      setOrdersRefreshing(false)
    }
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="max-w-5xl mx-auto px-4 py-2">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-bold">Jupiter Limit Orders</h1>
        </div>
        
        <div className="mb-3">
          <TokenInput onTokenSelect={handleTokenSelect} />
        </div>

        {selectedToken && (
          <div className="mb-4">
            <div className="flex items-center justify-between bg-gray-800 rounded-lg p-4 mb-4">
              <div className="flex items-center gap-4">
                <h2 className="text-xl font-bold">{selectedToken.symbol}</h2>
                {currentPrice !== null && (
                  <span className="text-lg">
                    ${currentPrice.toFixed(6)} USDC
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleRefreshPrice}
                  disabled={isPriceRefreshing}
                  className={`px-2 py-1 bg-blue-600 text-xs text-white rounded hover:bg-blue-700 disabled:opacity-50 ${isPriceRefreshing ? 'opacity-50' : ''}`}
                >
                  {isPriceRefreshing ? 'Refreshing Price...' : 'Refresh Price'}
                </button>
                <button
                  onClick={handleRefreshOrders}
                  disabled={isOrdersRefreshing}
                  className={`px-2 py-1 bg-blue-600 text-xs text-white rounded hover:bg-blue-700 disabled:opacity-50 ${isOrdersRefreshing ? 'opacity-50' : ''}`}
                >
                  {isOrdersRefreshing ? 'Refreshing Orders...' : 'Refresh Orders'}
                </button>
                <label className="flex items-center text-xs text-gray-400">
                  <input
                    type="checkbox"
                    className="mr-1 h-3 w-3"
                    checked={autoRefresh}
                    onChange={(e) => setAutoRefresh(e.target.checked)}
                  />
                  Auto-refresh
                </label>
              </div>
            </div>
            <TokenSection 
              tokenConfig={selectedToken} 
              currentPrice={currentPrice || 0}
              tokenPrices={tokenPrices}
              autoRefresh={autoRefresh}
              isPriceFetching={isPriceFetching}
            />
          </div>
        )}
      </div>
    </main>
  )
}