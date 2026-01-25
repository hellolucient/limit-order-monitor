'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { TokenSection } from '../components/TokenSection'
import { TokenInput } from '../components/TokenInput'
import { TradingIntervals } from '../components/TradingIntervals'
import { TradeInterface, TradeData } from '../components/TradeInterface'
import { WalletButton } from '../components/WalletButton'
import { TokenInfo } from '../lib/types'
import { PriceService } from '@/lib/services/PriceService'
import { JupiterLimitOrderService } from '@/lib/services/JupiterLimitOrderService'
import { useLimitOrders } from '@/lib/hooks/useLimitOrders'
import { PriceInterval, orderToInterval } from '../lib/utils/intervalAnalysis'
import { LimitOrder } from '../lib/types'

export default function Home() {
  const { publicKey, signTransaction, sendTransaction, connected } = useWallet()
  const { connection } = useConnection()
  const [selectedToken, setSelectedToken] = useState<TokenInfo | null>(null)
  const [currentPrice, setCurrentPrice] = useState<number | null>(null)
  const [tokenPrices, setTokenPrices] = useState<Map<string, number>>(new Map())
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [isPriceRefreshing, setPriceRefreshing] = useState(false)
  const [isOrdersRefreshing, setOrdersRefreshing] = useState(false)
  const [isPriceFetching, setIsPriceFetching] = useState(false)
  const [selectedInterval, setSelectedInterval] = useState<PriceInterval | null>(null)
  const [isExecutingTrade, setIsExecutingTrade] = useState(false)

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
      // Only fetch prices for tokens that are likely to have valid routes (SOL, USDC, and the selected token)
      const SOL_MINT = 'So11111111111111111111111111111111111111112'
      const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
      
      const uniqueTokens = new Set<string>()
      // Always include the selected token and common quote currencies
      uniqueTokens.add(selectedToken.address)
      uniqueTokens.add(SOL_MINT)
      uniqueTokens.add(USDC_MINT)
      
      // Only add tokens from orders that are likely to be valid (SOL, USDC, or the selected token)
      orders.forEach(order => {
        if (order.inputMint.address === SOL_MINT || 
            order.inputMint.address === USDC_MINT || 
            order.inputMint.address === selectedToken.address) {
          uniqueTokens.add(order.inputMint.address)
        }
        if (order.outputMint.address === SOL_MINT || 
            order.outputMint.address === USDC_MINT || 
            order.outputMint.address === selectedToken.address) {
          uniqueTokens.add(order.outputMint.address)
        }
      })

      const tokenArray = Array.from(uniqueTokens)
      console.log('Fetching prices for relevant tokens:', tokenArray)

      // Fetch prices for relevant tokens only (failures are handled gracefully)
      const prices = await priceService.fetchPricesForAddresses(tokenArray)
      
      console.log('Fetched prices:', Array.from(prices.entries()).map(([addr, price]) => ({
        address: addr,
        price: price,
        symbol: orders.find(o => o.inputMint.address === addr || o.outputMint.address === addr)?.inputMint.symbol || 'unknown'
      })))
      
      setTokenPrices(prices)
    } catch (error) {
      console.error('Error fetching all prices:', error)
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

  const handleOrderClick = (order: LimitOrder) => {
    // Convert the clicked order to a PriceInterval and set it as selected
    const interval = orderToInterval(order)
    setSelectedInterval(interval)
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

  // Get buy and sell orders for the selected token
  const buyOrders = useMemo(() => {
    if (!orders || !selectedToken) return []
    return orders.filter(order => {
      const isRelevantToken = order.inputMint.address === selectedToken.address || 
        order.outputMint.address === selectedToken.address
      return isRelevantToken && order.orderType === 'BUY'
    })
  }, [orders, selectedToken])

  const sellOrders = useMemo(() => {
    if (!orders || !selectedToken) return []
    return orders.filter(order => {
      const isRelevantToken = order.inputMint.address === selectedToken.address || 
        order.outputMint.address === selectedToken.address
      return isRelevantToken && order.orderType === 'SELL'
    })
  }, [orders, selectedToken])

  const handleTrade = async (tradeData: TradeData) => {
    if (!publicKey || !signTransaction || !sendTransaction || !selectedToken || !selectedInterval) {
      alert('Please connect your wallet to execute trades')
      return
    }

    setIsExecutingTrade(true)

    try {
      const limitOrderService = new JupiterLimitOrderService()
      
      // Determine input and output mints based on trade type
      // Logic:
      // - Buy interval = buyers paying with inputMint to get outputMint (the token)
      // - Sell interval = sellers giving inputMint (the token) to get outputMint
      const sampleOrder = selectedInterval.orders[0]
      const isBuyInterval = sampleOrder.orderType === 'BUY'
      
      let inputMint: string
      let outputMint: string
      
      if (tradeData.type === 'BUY') {
        // You're buying the token
        // Pay with what sellers in the interval want (for sell intervals) or what buyers are using (for buy intervals - less common)
        inputMint = isBuyInterval 
          ? sampleOrder.inputMint.address  // Buy interval: pay with what buyers are paying with
          : sampleOrder.outputMint.address  // Sell interval: pay with what sellers are receiving
        outputMint = selectedToken.address  // Always receiving the selected token
      } else {
        // You're selling the token
        // Receive what buyers are paying with (for buy intervals) or what sellers are getting (for sell intervals)
        inputMint = selectedToken.address    // Always selling the selected token
        outputMint = isBuyInterval
          ? sampleOrder.inputMint.address    // Buy interval: receive what buyers are paying with
          : sampleOrder.outputMint.address  // Sell interval: receive what sellers are getting
      }

      // Get decimals for both tokens
      const inputDecimals = tradeData.type === 'BUY'
        ? (sampleOrder.inputMint.decimals || 9)
        : selectedToken.decimals
      const outputDecimals = tradeData.type === 'BUY'
        ? selectedToken.decimals
        : (sampleOrder.outputMint.decimals || 9)

      // Calculate amounts in smallest units
      // For BUY: makingAmount = amount * price (in quote currency), takingAmount = amount (in token)
      // For SELL: makingAmount = amount (in token), takingAmount = amount * price (in quote currency)
      const makingAmount = tradeData.type === 'BUY'
        ? tradeData.amount * tradeData.price  // Amount of quote currency you're paying
        : tradeData.amount                     // Amount of token you're selling
      const takingAmount = tradeData.type === 'BUY'
        ? tradeData.amount                     // Amount of token you want to receive
        : tradeData.amount * tradeData.price   // Amount of quote currency you want to receive

      // Validate that input and output mints are different
      if (inputMint === outputMint) {
        throw new Error(
          `Cannot create limit order: input and output tokens are the same (${inputMint}). ` +
          `This usually means the interval contains orders for the same token pair.`
        )
      }

      const inAmount = Math.floor(makingAmount * Math.pow(10, inputDecimals)).toString()
      const outAmount = Math.floor(takingAmount * Math.pow(10, outputDecimals)).toString()

      console.log('Limit order parameters:', {
        tradeType: tradeData.type,
        isBuyInterval,
        inputMint,
        outputMint,
        inAmount,
        outAmount,
        makingAmount,
        takingAmount,
      })

      // Create the limit order
      const signature = await limitOrderService.executeLimitOrder(
        {
          maker: publicKey.toString(),
          payer: publicKey.toString(),
          inputMint,
          outputMint,
          inAmount,
          outAmount,
        },
        signTransaction,
        async (tx) => {
          // Send transaction using wallet adapter
          const sig = await sendTransaction(tx, connection, {
            skipPreflight: false,
            maxRetries: 3,
          })
          // Wait for confirmation
          await connection.confirmTransaction(sig, 'confirmed')
          return sig
        }
      )

      alert(`Limit order created successfully! Signature: ${signature}\n\nYour order will execute when the price matches.`)
      console.log('Limit order created:', signature)
      
      // Refresh orders to show the new order
      await refreshOrders()
    } catch (error: any) {
      console.error('Limit order creation failed:', error)
      alert(`Limit order failed: ${error.message}`)
    } finally {
      setIsExecutingTrade(false)
    }
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="max-w-5xl mx-auto px-4 py-2">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-bold">Trade Into Open Orders</h1>
          <WalletButton />
        </div>
        
        <div className="mb-3">
          <TokenInput onTokenSelect={handleTokenSelect} />
        </div>

        {selectedToken && (
          <div className="mb-4">
            <div className="flex items-center justify-between bg-gray-800 rounded-lg p-4 mb-4">
              <div className="flex items-center gap-3">
                {selectedToken.logoURI && (
                  <img 
                    src={selectedToken.logoURI} 
                    alt={selectedToken.name}
                    className="w-8 h-8 rounded-full border border-gray-600"
                    onError={(e) => {
                      // Hide image if it fails to load
                      (e.target as HTMLImageElement).style.display = 'none'
                    }}
                  />
                )}
                <span className="text-lg font-semibold text-white">{selectedToken.name}</span>
                <span className="text-sm text-gray-400">
                  {selectedToken.address.slice(0, 7)}...
                </span>
                {currentPrice !== null && (
                  <span className="text-lg text-white">
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
            {/* Trading Interface Section - Top Priority */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
              <TradingIntervals
                buyOrders={buyOrders}
                sellOrders={sellOrders}
                tokenSymbol={selectedToken.symbol}
                currentPrice={currentPrice}
                onSelectInterval={setSelectedInterval}
              />
              <TradeInterface
                selectedInterval={selectedInterval}
                tokenInfo={selectedToken}
                currentPrice={currentPrice}
                tokenPrices={tokenPrices}
                onTrade={handleTrade}
                isExecuting={isExecutingTrade}
              />
            </div>
            
            {/* Individual Orders Section - Bottom, Smaller */}
            <TokenSection 
              tokenConfig={selectedToken} 
              currentPrice={currentPrice || 0}
              tokenPrices={tokenPrices}
              autoRefresh={autoRefresh}
              isPriceFetching={isPriceFetching}
              onOrderClick={handleOrderClick}
            />
          </div>
        )}
      </div>
    </main>
  )
}