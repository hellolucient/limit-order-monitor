'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { TokenSection } from '../components/TokenSection'
import { TokenInput } from '../components/TokenInput'
import { TradingIntervals } from '../components/TradingIntervals'
import { TradeInterface, TradeData } from '../components/TradeInterface'
import { WalletButton } from '../components/WalletButton'
import { Terminal } from '../components/Terminal'
import { MobileTabs, TabType } from '../components/MobileTabs'
import { Track } from '../components/Track'
import { TokenSearch } from '../components/TokenSearch'
import { TokenInfo } from '../lib/types'
import { PriceService } from '@/lib/services/PriceService'
import { JupiterLimitOrderService } from '@/lib/services/JupiterLimitOrderService'
import { useLimitOrders } from '@/lib/hooks/useLimitOrders'
import { PriceInterval, orderToInterval } from '../lib/utils/intervalAnalysis'
import { LimitOrder } from '../lib/types'

export default function Home() {
  const { publicKey, signTransaction, sendTransaction, connected } = useWallet()
  const { connection } = useConnection()
  const [activeTab, setActiveTab] = useState<TabType>('terminal')
  const [selectedToken, setSelectedToken] = useState<TokenInfo | null>(null)
  const [currentPrice, setCurrentPrice] = useState<number | null>(null)
  const [tokenPrices, setTokenPrices] = useState<Map<string, number>>(new Map())
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [isPriceRefreshing, setPriceRefreshing] = useState(false)
  const [isOrdersRefreshing, setOrdersRefreshing] = useState(false)
  const [isPriceFetching, setIsPriceFetching] = useState(false)
  const [selectedInterval, setSelectedInterval] = useState<PriceInterval | null>(null)
  const [isExecutingTrade, setIsExecutingTrade] = useState(false)

  // When a token is selected from Terminal or Track, switch to Trade tab
  const handleTokenSelect = (token: TokenInfo) => {
    setSelectedToken(token)
    setActiveTab('trade')
  }

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
    <main className="min-h-screen bg-black text-white pb-20">
      {/* Mobile Header */}
      <div className="sticky top-0 z-40 bg-black border-b border-gray-800">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-lg font-bold">Trade Into Open Orders</h1>
          <WalletButton />
        </div>
      </div>

      {/* Tab Content */}
      <div className="min-h-[calc(100vh-80px)]">
        {activeTab === 'terminal' ? (
          <Terminal onTokenSelect={handleTokenSelect} />
        ) : activeTab === 'track' ? (
          <Track onTokenSelect={handleTokenSelect} />
        ) : (
          // Trade tab
          <div className="h-full flex flex-col">
            {!selectedToken ? (
              <TokenSearch onTokenSelect={handleTokenSelect} />
            ) : (
              <div className="flex-1 overflow-y-auto px-4 py-4">
              <div className="space-y-4">
                {/* Token Header Card - Mobile Optimized */}
                <div className="bg-[#1e1f2e] rounded-lg p-4">
                  <div className="flex items-center gap-3 mb-3">
                    {selectedToken.logoURI && (
                      <img 
                        src={selectedToken.logoURI} 
                        alt={selectedToken.name}
                        className="w-12 h-12 rounded-full border border-gray-600"
                        loading="lazy"
                        decoding="async"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none'
                        }}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <h2 className="text-lg font-semibold text-white truncate">
                        {selectedToken.name}
                      </h2>
                      <p className="text-sm text-gray-400 truncate">
                        {selectedToken.symbol} • {selectedToken.address.slice(0, 8)}...
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {currentPrice !== null && (
                        <div className="text-right">
                          <div className="text-lg font-semibold text-white">
                            ${currentPrice.toFixed(6)}
                          </div>
                          <div className="text-xs text-gray-400">USDC</div>
                        </div>
                      )}
                      <button
                        onClick={() => {
                          setSelectedToken(null)
                          setSelectedInterval(null)
                        }}
                        className="p-2 text-gray-400 hover:text-white transition-colors"
                        aria-label="Cancel trade"
                        title="Cancel trade"
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
                  </div>
                  
                  {/* Action Buttons - Mobile Friendly */}
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={handleRefreshPrice}
                      disabled={isPriceRefreshing}
                      className="flex-1 px-3 py-2 bg-blue-600 text-sm text-white rounded hover:bg-blue-700 disabled:opacity-50"
                    >
                      {isPriceRefreshing ? 'Refreshing...' : 'Refresh Price'}
                    </button>
                    <button
                      onClick={handleRefreshOrders}
                      disabled={isOrdersRefreshing}
                      className="flex-1 px-3 py-2 bg-blue-600 text-sm text-white rounded hover:bg-blue-700 disabled:opacity-50"
                    >
                      {isOrdersRefreshing ? 'Refreshing...' : 'Refresh Orders'}
                    </button>
                    <label className="flex items-center px-3 py-2 bg-gray-700 rounded text-sm text-gray-300 cursor-pointer">
                      <input
                        type="checkbox"
                        className="mr-2 h-4 w-4"
                        checked={autoRefresh}
                        onChange={(e) => setAutoRefresh(e.target.checked)}
                      />
                      Auto-refresh
                    </label>
                  </div>
                </div>

                {/* Trading Interface - Stacked on Mobile */}
                <div className="space-y-4">
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
                
                {/* Individual Orders Section */}
                <TokenSection 
                  tokenConfig={selectedToken} 
                  currentPrice={currentPrice || 0}
                  tokenPrices={tokenPrices}
                  autoRefresh={autoRefresh}
                  isPriceFetching={isPriceFetching}
                  onOrderClick={handleOrderClick}
                />
              </div>
            </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Tab Navigation */}
      <MobileTabs activeTab={activeTab} onTabChange={setActiveTab} />
    </main>
  )
}