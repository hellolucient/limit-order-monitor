'use client'

import React, { useMemo, useState } from 'react'
import { LimitOrder } from '../lib/types'
import { findOrderIntervals, getTopIntervals, PriceInterval } from '../lib/utils/intervalAnalysis'
import { formatPrice } from '../lib/utils/formatters'

interface TradingIntervalsProps {
  buyOrders: LimitOrder[]
  sellOrders: LimitOrder[]
  tokenSymbol: string
  currentPrice: number | null
  onSelectInterval?: (interval: PriceInterval) => void
}

export function TradingIntervals({ 
  buyOrders,
  sellOrders, 
  tokenSymbol, 
  currentPrice,
  onSelectInterval 
}: TradingIntervalsProps) {
  const [activeTab, setActiveTab] = useState<'buy' | 'sell'>('sell')

  const buyIntervals = useMemo(() => {
    if (buyOrders.length === 0) return []
    const foundIntervals = findOrderIntervals(buyOrders, 0.05, 2) // 5% intervals, min 2 orders
    return getTopIntervals(foundIntervals, 5) // Top 5 intervals
  }, [buyOrders])

  const sellIntervals = useMemo(() => {
    if (sellOrders.length === 0) return []
    const foundIntervals = findOrderIntervals(sellOrders, 0.05, 2) // 5% intervals, min 2 orders
    return getTopIntervals(foundIntervals, 5) // Top 5 intervals
  }, [sellOrders])

  const intervals = activeTab === 'buy' ? buyIntervals : sellIntervals
  const orderType = activeTab === 'buy' ? 'BUY' : 'SELL'
  const colorClass = activeTab === 'buy' ? 'green' : 'red'

  const renderInterval = (interval: PriceInterval, index: number) => {
    const isBelowCurrent = currentPrice && interval.averagePrice < currentPrice
    const priceDiff = currentPrice 
      ? ((interval.averagePrice - currentPrice) / currentPrice) * 100 
      : 0

    const borderColor = isBelowCurrent 
      ? (activeTab === 'buy' ? 'border-green-500/30' : 'border-red-500/30')
      : 'border-gray-700/50'
    const textColor = activeTab === 'buy' ? 'text-green-400' : 'text-red-400'

    // Get quote currency from the first order in the interval
    const sampleOrder = interval.orders[0]
    const quoteCurrency = activeTab === 'buy' 
      ? sampleOrder.inputMint  // For buy: paying with inputMint
      : sampleOrder.outputMint  // For sell: receiving outputMint

    return (
      <div
        key={index}
        className={`bg-[#1a1b23] p-3 rounded border ${borderColor} cursor-pointer hover:border-blue-500/50 transition-colors`}
        onClick={() => onSelectInterval?.(interval)}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium ${textColor}`}>
              Interval #{index + 1}
            </span>
            <span className="text-xs text-gray-500 bg-gray-700/50 px-2 py-0.5 rounded">
              {quoteCurrency.symbol}
            </span>
            {isBelowCurrent && (
              <span className="text-xs text-green-400 bg-green-500/10 px-2 py-0.5 rounded">
                Below Market
              </span>
            )}
          </div>
          <div className="text-xs text-gray-400">
            {interval.orderCount} orders
          </div>
        </div>

        <div className="space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-gray-400">Price Range:</span>
            <span className="text-gray-300">
              {formatPrice(interval.minPrice)} - {formatPrice(interval.maxPrice)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Average Price:</span>
            <span className="text-white font-medium">
              {formatPrice(interval.averagePrice)} {quoteCurrency.symbol}/{tokenSymbol}
            </span>
          </div>
          {currentPrice && (
            <div className="flex justify-between">
              <span className="text-gray-400">vs Current:</span>
              <span className={priceDiff < 0 ? 'text-green-400' : 'text-red-400'}>
                {priceDiff > 0 ? '+' : ''}{priceDiff.toFixed(2)}%
              </span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-gray-400">Total Volume:</span>
            <span className="text-gray-300">
              {interval.totalVolume > 0 && interval.totalVolume < 0.01
                ? interval.totalVolume.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 8 })
                : interval.totalVolume.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })
              } {tokenSymbol}
            </span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-[#1e1f2e] rounded-lg p-4 flex flex-col" style={{ height: '750px' }}>
      {/* Tabs */}
      <div className="flex gap-2 mb-3 flex-shrink-0">
        <button
          onClick={() => setActiveTab('buy')}
          className={`flex-1 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
            activeTab === 'buy'
              ? 'bg-green-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          Buy Intervals ({buyIntervals.length})
        </button>
        <button
          onClick={() => setActiveTab('sell')}
          className={`flex-1 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
            activeTab === 'sell'
              ? 'bg-red-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          Sell Intervals ({sellIntervals.length})
        </button>
      </div>

      {/* Intervals List - Fixed height with scrolling */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {intervals.length === 0 ? (
          <p className="text-xs text-gray-500">
            No {activeTab} intervals found. Need at least 2 orders in a price range.
          </p>
        ) : (
          <>
            <h3 className="text-sm font-medium mb-3 text-gray-300 flex-shrink-0">
              Top {orderType} Order Intervals ({intervals.length})
            </h3>
            <div className="space-y-2">
              {intervals.map((interval, index) => renderInterval(interval, index))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
