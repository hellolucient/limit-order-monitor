'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { PriceInterval } from '../lib/utils/intervalAnalysis'
import { TokenInfo } from '../lib/types'
import { formatPrice } from '../lib/utils/formatters'
import { useWalletBalances } from '../lib/hooks/useWalletBalances'

interface TradeInterfaceProps {
  selectedInterval: PriceInterval | null
  tokenInfo: TokenInfo
  currentPrice: number | null
  tokenPrices?: Map<string, number> // USD prices for tokens
  onTrade?: (tradeData: TradeData) => void
  isExecuting?: boolean
}

export interface TradeData {
  type: 'BUY' | 'SELL'
  amount: number
  price: number
  interval: PriceInterval
}

export function TradeInterface({ 
  selectedInterval, 
  tokenInfo, 
  currentPrice,
  tokenPrices = new Map(),
  onTrade,
  isExecuting = false
}: TradeInterfaceProps) {
  const { connected } = useWallet()
  const [tradeType, setTradeType] = useState<'BUY' | 'SELL'>('BUY')
  const [amount, setAmount] = useState<string>('')
  const [customPrice, setCustomPrice] = useState<string>('')

  // Determine quote currency from the interval's orders (before early return to maintain hook order)
  const quoteCurrency = useMemo(() => {
    if (!selectedInterval) return null
    const sampleOrder = selectedInterval.orders[0]
    const isBuyInterval = sampleOrder.orderType === 'BUY'
    return isBuyInterval 
      ? sampleOrder.inputMint  // For buy: paying with inputMint (e.g., SOL)
      : sampleOrder.outputMint // For sell: receiving outputMint (e.g., SOL)
  }, [selectedInterval])

  // Fetch balances for quote currency and base token (always call hooks, even if selectedInterval is null)
  const tokenAddresses = useMemo(() => {
    if (!quoteCurrency) return [tokenInfo.address]
    const addresses = [tokenInfo.address]
    if (quoteCurrency.address !== tokenInfo.address) {
      addresses.push(quoteCurrency.address)
    }
    return addresses
  }, [tokenInfo.address, quoteCurrency?.address])

  const { sol, tokens, loading: balancesLoading } = useWalletBalances(tokenAddresses)

  // Automatically set trade type to OPPOSITE of interval type when interval changes
  // Buy intervals = people want to buy → you should SELL to them
  // Sell intervals = people want to sell → you should BUY from them
  useEffect(() => {
    if (selectedInterval) {
      const sampleOrder = selectedInterval.orders[0]
      const intervalType = sampleOrder.orderType
      // Set trade type to opposite: buy interval → sell order, sell interval → buy order
      setTradeType(intervalType === 'BUY' ? 'SELL' : 'BUY')
      // Reset amount and custom price when switching intervals
      setAmount('')
      setCustomPrice('')
    }
  }, [selectedInterval])

  if (!selectedInterval || !quoteCurrency) {
    return (
      <div className="bg-[#1e1f2e] rounded-lg p-4">
        <h3 className="text-sm font-medium mb-2 text-gray-300">Trading Interface</h3>
        <p className="text-xs text-gray-500">
          Select an interval above to start trading
        </p>
      </div>
    )
  }

  // Get balances
  const quoteBalance = quoteCurrency.address === 'So11111111111111111111111111111111111111112' 
    ? sol 
    : tokens.get(quoteCurrency.address) || 0
  const tokenBalance = tokens.get(tokenInfo.address) || 0

  const intervalPrice = customPrice ? parseFloat(customPrice) : selectedInterval.averagePrice
  const amountNum = parseFloat(amount) || 0
  // Total cost/receive is in quote currency (e.g., SOL)
  const totalCost = amountNum * intervalPrice

  // Get USD prices for calculations
  const SOL_MINT = 'So11111111111111111111111111111111111111112'
  const quoteCurrencyPrice = quoteCurrency.address === SOL_MINT 
    ? (tokenPrices.get(SOL_MINT) || null)
    : (quoteCurrency.address === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' ? 1 : tokenPrices.get(quoteCurrency.address) || null)
  const tokenUsdPrice = currentPrice || tokenPrices.get(tokenInfo.address) || null

  // Calculate USD equivalents
  // For BUY: amountUsd should show what you're spending (totalCost), not token value
  // For SELL: amountUsd shows what you're selling (token value)
  const amountUsd = tradeType === 'BUY'
    ? (quoteCurrencyPrice ? totalCost * quoteCurrencyPrice : null)  // What you're spending
    : (tokenUsdPrice ? amountNum * tokenUsdPrice : null)  // Value of tokens you're selling
  const totalCostUsd = quoteCurrencyPrice ? totalCost * quoteCurrencyPrice : null
  // Use a more conservative threshold ($6) to account for price differences between our display and Jupiter's calculation
  // Jupiter uses their own price data which may differ from ours
  const isBelowMinimum = totalCostUsd !== null && totalCostUsd < 6

  // Calculate max amounts
  const maxAmount = tradeType === 'BUY' 
    ? quoteBalance ? quoteBalance / intervalPrice : 0  // Max tokens you can buy with available quote currency
    : tokenBalance || 0  // Max tokens you can sell

  const handleMax = () => {
    if (maxAmount > 0) {
      setAmount(maxAmount.toFixed(6))
    }
  }

  // Check if user has sufficient balance
  // Use a small epsilon for floating point comparison
  const EPSILON = 0.000001
  const hasInsufficientBalance = tradeType === 'BUY'
    ? (quoteBalance !== null && totalCost > quoteBalance + EPSILON)
    : (tokenBalance !== null && amountNum > tokenBalance + EPSILON)

  const handleTrade = () => {
    if (amountNum <= 0 || !intervalPrice) return

    const tradeData: TradeData = {
      type: tradeType,
      amount: amountNum,
      price: intervalPrice,
      interval: selectedInterval
    }

    onTrade?.(tradeData)
  }

  const priceDiff = currentPrice 
    ? ((intervalPrice - currentPrice) / currentPrice) * 100 
    : 0

  return (
    <div className="bg-[#1e1f2e] rounded-lg p-4 flex flex-col" style={{ height: '750px' }}>
      <h3 className="text-sm font-medium mb-3 text-gray-300 flex-shrink-0">Trade into Orders</h3>
      
      <div className="space-y-4 flex-1 overflow-y-auto min-h-0">
        {/* Trade Type Selection */}
        <div>
          <label className="text-xs text-gray-400 mb-2 block">Trade Type</label>
          <div className="flex gap-2">
            <button
              onClick={() => setTradeType('BUY')}
              className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-colors ${
                tradeType === 'BUY'
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              Buy
            </button>
            <button
              onClick={() => setTradeType('SELL')}
              className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-colors ${
                tradeType === 'SELL'
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              Sell
            </button>
          </div>
        </div>

        {/* Amount Input */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-gray-400">
              Amount ({tokenInfo.symbol})
            </label>
            {connected && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">
                  Balance: {tradeType === 'BUY' 
                    ? (quoteBalance !== null ? (
                        <>
                          {quoteBalance.toFixed(4)} {quoteCurrency.symbol}
                          {quoteCurrencyPrice !== null && (
                            <span className="text-gray-600 ml-1">
                              (≈ ${(quoteBalance * quoteCurrencyPrice).toFixed(2)})
                            </span>
                          )}
                        </>
                      ) : '...')
                    : (tokenBalance !== null ? (
                        <>
                          {tokenBalance.toFixed(4)} {tokenInfo.symbol}
                          {tokenUsdPrice !== null && (
                            <span className="text-gray-600 ml-1">
                              (≈ ${(tokenBalance * tokenUsdPrice).toFixed(2)})
                            </span>
                          )}
                        </>
                      ) : '...')
                  }
                </span>
                {maxAmount > 0 && (
                  <button
                    onClick={handleMax}
                    className="text-xs text-blue-400 hover:text-blue-300"
                  >
                    Max
                  </button>
                )}
              </div>
            )}
          </div>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            step="0.000001"
            min="0"
            className={`w-full px-3 py-2 bg-[#1a1b23] border rounded text-white text-sm focus:outline-none focus:border-blue-500 ${
              hasInsufficientBalance ? 'border-red-500' : 'border-gray-700'
            }`}
          />
          {amountNum > 0 && amountUsd !== null && (
            <p className="text-xs text-gray-500 mt-1">
              {tradeType === 'BUY' ? 'Cost: ' : 'Value: '}≈ ${amountUsd.toFixed(2)} USD
            </p>
          )}
          {hasInsufficientBalance && (
            <p className="text-xs text-red-400 mt-1">
              Insufficient balance
            </p>
          )}
        </div>

        {/* Price Input */}
        <div>
          <label className="text-xs text-gray-400 mb-2 block">
            Price ({quoteCurrency.symbol} per {tokenInfo.symbol})
          </label>
          <div className="space-y-2">
            <input
              type="number"
              value={customPrice}
              onChange={(e) => setCustomPrice(e.target.value)}
              placeholder={formatPrice(selectedInterval.averagePrice)}
              step="0.000001"
              min="0"
              className="w-full px-3 py-2 bg-[#1a1b23] border border-gray-700 rounded text-white text-sm focus:outline-none focus:border-blue-500"
            />
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">
                Interval: {formatPrice(selectedInterval.minPrice)} - {formatPrice(selectedInterval.maxPrice)}
              </span>
              {currentPrice && (
                <span className={priceDiff < 0 ? 'text-green-400' : 'text-red-400'}>
                  {priceDiff > 0 ? '+' : ''}{priceDiff.toFixed(2)}% vs market
                </span>
              )}
            </div>
            <button
              onClick={() => setCustomPrice(selectedInterval.averagePrice.toString())}
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              Use interval average
            </button>
          </div>
        </div>

        {/* Trade Summary */}
        {amountNum > 0 && (
          <div className="bg-[#1a1b23] p-3 rounded border border-gray-700/50">
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-400">Amount ({tokenInfo.symbol}):</span>
                <span className="text-white">
                  {amountNum > 0 && amountNum < 0.01
                    ? amountNum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 8 })
                    : amountNum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })
                  } {tokenInfo.symbol}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Price:</span>
                <span className="text-white">{formatPrice(intervalPrice)} {quoteCurrency.symbol} per {tokenInfo.symbol}</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-gray-700/50">
                <span className="text-gray-400">Total {tradeType === 'BUY' ? 'Cost' : 'Receive'}:</span>
                <span className="text-white font-medium">
                  {totalCost.toLocaleString(undefined, { maximumFractionDigits: 6 })} {quoteCurrency.symbol}
                  {totalCostUsd !== null && (
                    <span className="text-gray-500 ml-2">(≈ ${totalCostUsd.toFixed(2)})</span>
                  )}
                </span>
              </div>
              {isBelowMinimum && (
                <div className="pt-1 border-t border-yellow-500/30">
                  <p className="text-xs text-yellow-400">
                    ⚠️ Order should be at least $6.00 USD to account for price differences. 
                    Jupiter may calculate this as ${totalCostUsd ? (totalCostUsd * 0.7).toFixed(2) : '?'} based on their price data.
                    (Current: ${totalCostUsd?.toFixed(2)})
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Trade Button */}
        {!connected ? (
          <div className="space-y-2">
            <button
              disabled
              className="w-full py-2 px-4 rounded font-medium text-sm bg-gray-600 text-gray-400 cursor-not-allowed"
            >
              Connect Wallet to Trade
            </button>
            <p className="text-xs text-gray-500 text-center">
              Connect your wallet to execute trades
            </p>
          </div>
        ) : (
          <button
            onClick={handleTrade}
            disabled={amountNum <= 0 || !intervalPrice || hasInsufficientBalance || balancesLoading || isExecuting || isBelowMinimum}
            className={`w-full py-2 px-4 rounded font-medium text-sm transition-colors ${
              tradeType === 'BUY'
                ? 'bg-green-600 hover:bg-green-700 text-white'
                : 'bg-red-600 hover:bg-red-700 text-white'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {isExecuting 
              ? 'Creating Limit Order...' 
              : balancesLoading 
                ? 'Loading...' 
                : (tradeType === 'BUY' ? 'Create Buy Limit Order' : 'Create Sell Limit Order')
            }
          </button>
        )}
      </div>
    </div>
  )
}
