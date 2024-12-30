'use client'

import React, { useEffect, useState } from 'react'
import { LimitOrderCard } from './LimitOrderCard'
import { useLimitOrders } from '../lib/hooks/useLimitOrders'
import { useMemo } from 'react'
import { SortButton, SortOption } from './shared/SortButton'
import type { LimitOrder } from '../lib/types'
import { OrderBookChart } from './charts/OrderBookChart'
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline'

interface TokenSectionProps {
  tokenSymbol: 'LOGOS' | 'CHAOS'
  currentPrice: number
  autoRefresh?: boolean
}

interface OrderPoint {
  x: number
  y: number
  orderCount: number
  timestamp: number
}

interface ChartData {
  buyOrders: OrderPoint[]
  sellOrders: OrderPoint[]
}

export function TokenSection({ tokenSymbol, currentPrice, autoRefresh = false }: TokenSectionProps) {
  const [sortOption, setSortOption] = useState<SortOption>('amount-desc')
  const [expandedCards, setExpandedCards] = useState<{ [key: string]: boolean }>({
    buy: true,
    sell: true
  })

  const { orders, summary, loading, error } = useLimitOrders(autoRefresh)

  // Replace chartData state and useEffect with useMemo
  const chartData = useMemo(() => {
    if (!orders.length) return null;

    const aggregatePricePoints = (orders: LimitOrder[]): OrderPoint[] => {
      const pricePoints = new Map<number, OrderPoint>()
      
      for (const order of orders) {
        const price = Number(order.price.toFixed(6))
        const amount = order.orderType === 'BUY' ? order.takingAmount : order.makingAmount
        
        if (pricePoints.has(price)) {
          const point = pricePoints.get(price)!
          point.y += amount
          point.orderCount++
        } else {
          pricePoints.set(price, {
            x: price,
            y: amount,
            timestamp: new Date(order.createdAt).getTime(),
            orderCount: 1
          })
        }
      }

      return Array.from(pricePoints.values())
        .sort((a, b) => a.x - b.x)
    }

    // Use the same filtering logic as the cards
    const tokenOrders = orders.filter(order => 
      (order.inputMint.symbol === tokenSymbol || order.outputMint.symbol === tokenSymbol)
    )

    const buyOrders = tokenOrders.filter(o => o.orderType === 'BUY')
    const sellOrders = tokenOrders.filter(o => o.orderType === 'SELL')

    return {
      buyOrders: aggregatePricePoints(buyOrders),
      sellOrders: aggregatePricePoints(sellOrders)
    }
  }, [orders, tokenSymbol])

  // Filter orders for the current token
  const tokenOrders = useMemo(() => orders.filter(order => 
    (order.inputMint.symbol === tokenSymbol || order.outputMint.symbol === tokenSymbol)
  ), [orders, tokenSymbol])

  // Sort orders
  const sortOrders = (orders: LimitOrder[]) => {
    return [...orders].sort((a, b) => {
      if (sortOption.startsWith('date')) {
        const dateA = new Date(a.createdAt).getTime()
        const dateB = new Date(b.createdAt).getTime()
        return sortOption === 'date-asc' ? dateA - dateB : dateB - dateA
      }
      
      if (sortOption.startsWith('price')) {
        return sortOption === 'price-asc' ? a.price - b.price : b.price - a.price
      }
      
      const amountA = a.orderType === 'BUY' ? a.takingAmount : a.makingAmount
      const amountB = b.orderType === 'BUY' ? b.takingAmount : b.makingAmount
      return sortOption === 'amount-asc' ? amountA - amountB : amountB - amountA
    })
  }

  const sortedBuyOrders = useMemo(() => 
    sortOrders(tokenOrders.filter(o => o.orderType === 'BUY')),
    [tokenOrders, sortOption]
  )

  const sortedSellOrders = useMemo(() => 
    sortOrders(tokenOrders.filter(o => o.orderType === 'SELL')),
    [tokenOrders, sortOption]
  )

  const tokenSummary = summary[tokenSymbol] || {
    buyOrders: 0,
    sellOrders: 0,
    buyVolume: 0,
    sellVolume: 0
  }

  // Format helpers
  const formatNumber = (value: number, decimals = 0) => {
    return value.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    })
  }

  const formatCurrency = (value: number) => formatNumber(value, 2)
  
  const formatPrice = (value: number) => {
    if (value < 0.000001) {
      return formatNumber(value, 12)
    }
    return formatNumber(value, 6)
  }

  const toggleCard = (cardType: 'buy' | 'sell') => {
    setExpandedCards(prev => ({
      ...prev,
      [cardType]: !prev[cardType]
    }))
  }

  if (loading) {
    return (
      <section className="p-4 bg-gray-900 rounded-lg animate-pulse">
        <div className="h-96 bg-gray-800 rounded-lg flex items-center justify-center">
          <div className="text-gray-400 text-lg">Loading orders...</div>
        </div>
      </section>
    )
  }

  if (error) {
    return (
      <section className="p-4 bg-gray-900 rounded-lg">
        <div className="text-red-500">{error.message}</div>
      </section>
    )
  }

  return (
    <div className="relative">
      <div className="sticky top-0 z-10 bg-[#1a1b23] p-4 rounded-lg shadow-lg">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">{tokenSymbol}</h2>
          <div className="text-gray-400">
            Current Price: ${formatPrice(currentPrice)}
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 bg-[#1e1f2e] rounded-lg">
            <h3 className="text-green-500 mb-2">Buy Orders</h3>
            <div className="text-2xl font-bold">{formatNumber(tokenSummary.buyOrders)}</div>
            <div className="text-gray-400">Buy Volume</div>
            <div className="text-4xl font-black tracking-tight text-green-400">
              {formatNumber(tokenSummary.buyVolume)} <span className="text-base font-medium text-green-500">{tokenSymbol}</span>
            </div>
            <div className="text-sm text-gray-400">${formatCurrency(tokenSummary.buyVolume * currentPrice)}</div>
          </div>
          
          <div className="p-4 bg-[#1e1f2e] rounded-lg">
            <h3 className="text-red-500 mb-2">Sell Orders</h3>
            <div className="text-2xl font-bold">{formatNumber(tokenSummary.sellOrders)}</div>
            <div className="text-gray-400">Sell Volume</div>
            <div className="text-4xl font-black tracking-tight text-red-400">
              {formatNumber(tokenSummary.sellVolume)} <span className="text-base font-medium text-red-500">{tokenSymbol}</span>
            </div>
            <div className="text-sm text-gray-400">${formatCurrency(tokenSummary.sellVolume * currentPrice)}</div>
          </div>
        </div>
      </div>

      <section className="bg-[#1a1b23] rounded-lg p-4 mt-4">
        <div className="h-96 bg-[#1e1f2e] rounded-lg mb-4 p-4">
          {chartData && (
            <OrderBookChart 
              buyOrders={chartData.buyOrders} 
              sellOrders={chartData.sellOrders} 
              tokenSymbol={tokenSymbol}
            />
          )}
        </div>

        <div className="flex justify-between items-center mb-4">
          <SortButton currentSort={sortOption} onSortChange={setSortOption} />
        </div>

        <div className="space-y-4">
          <div className="bg-[#1e1f2e] rounded-lg overflow-hidden">
            <div 
              className="flex items-center justify-between p-4 cursor-pointer hover:bg-[#2d2e3d] transition-colors"
              onClick={() => toggleCard('buy')}
            >
              <div className="flex items-center space-x-2">
                <span className="text-green-500">•</span>
                <h2 className="text-lg font-semibold">Buy Orders</h2>
              </div>
              <ChevronUpIcon className={`w-5 h-5 text-gray-400 transition-transform ${expandedCards.buy ? 'rotate-0' : 'rotate-180'}`} />
            </div>
            <div className={`transition-all duration-200 ${expandedCards.buy ? 'max-h-[400px]' : 'max-h-0'} overflow-hidden`}>
              <div className="p-4 pt-0 overflow-y-auto max-h-[400px]">
                {sortedBuyOrders.length > 0 && (
                  <div className="space-y-2">
                    {sortedBuyOrders.map(order => (
                      <LimitOrderCard key={order.id} order={order} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="bg-[#1e1f2e] rounded-lg overflow-hidden">
            <div 
              className="flex items-center justify-between p-4 cursor-pointer hover:bg-[#2d2e3d] transition-colors"
              onClick={() => toggleCard('sell')}
            >
              <div className="flex items-center space-x-2">
                <span className="text-red-500">•</span>
                <h2 className="text-lg font-semibold">Sell Orders</h2>
              </div>
              <ChevronUpIcon className={`w-5 h-5 text-gray-400 transition-transform ${expandedCards.sell ? 'rotate-0' : 'rotate-180'}`} />
            </div>
            <div className={`transition-all duration-200 ${expandedCards.sell ? 'max-h-[400px]' : 'max-h-0'} overflow-hidden`}>
              <div className="p-4 pt-0 overflow-y-auto max-h-[400px]">
                {sortedSellOrders.length > 0 && (
                  <div className="space-y-2">
                    {sortedSellOrders.map(order => (
                      <LimitOrderCard key={order.id} order={order} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
} 