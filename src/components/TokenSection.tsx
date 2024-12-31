'use client'

import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { LimitOrderCard } from './LimitOrderCard'
import { useLimitOrders } from '../lib/hooks/useLimitOrders'
import { SortButton, SortOption } from './shared/SortButton'
import type { LimitOrder } from '../lib/types'
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline'
import { TokenInfo } from '../lib/types'

const USDC_ADDRESS = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'

interface TokenSectionProps {
  tokenConfig: TokenInfo
  currentPrice: number
  tokenPrices: Map<string, number>
  autoRefresh?: boolean
}

export function TokenSection({ 
  tokenConfig, 
  currentPrice, 
  tokenPrices,
  autoRefresh = false 
}: TokenSectionProps) {
  const [buySort, setBuySort] = useState<SortOption>('date-desc')
  const [sellSort, setSellSort] = useState<SortOption>('date-desc')

  const { orders, loading, error } = useLimitOrders(tokenConfig.address, autoRefresh)

  const tokenSummary = useMemo(() => {
    if (!orders) return {
      buyOrders: 0,
      sellOrders: 0,
      buyVolume: 0,
      sellVolume: 0
    }

    return orders.reduce((summary, order) => {
      if (order.inputMint.address === tokenConfig.address) {
        summary.sellOrders++
        summary.sellVolume += order.makingAmount
      }
      if (order.outputMint.address === tokenConfig.address) {
        summary.buyOrders++
        summary.buyVolume += order.takingAmount
      }
      return summary
    }, {
      buyOrders: 0,
      sellOrders: 0,
      buyVolume: 0,
      sellVolume: 0
    })
  }, [orders, tokenConfig.address])

  const tokenOrders = useMemo(() => 
    orders?.filter(order => 
      order.inputMint.address === tokenConfig.address || 
      order.outputMint.address === tokenConfig.address
    ) ?? [], 
    [orders, tokenConfig.address]
  )

  const getUsdcPrice = useCallback((order: LimitOrder): number | null => {
    const inputAddress = order.inputMint.address
    const outputAddress = order.outputMint.address
    
    // If one of the tokens is USDC, we can use the price directly
    if (inputAddress === USDC_ADDRESS || outputAddress === USDC_ADDRESS) {
      return order.price
    }

    // Get prices from the map
    const inputPrice = tokenPrices.get(inputAddress)
    const outputPrice = tokenPrices.get(outputAddress)

    if (inputPrice !== undefined && outputPrice !== undefined) {
      // Calculate USDC price
      return order.price * (inputPrice / outputPrice)
    }

    return null
  }, [tokenPrices])

  const sortOrders = useCallback((orders: LimitOrder[], sortOption: SortOption) => {
    return [...orders].sort((a, b) => {
      if (sortOption.startsWith('date')) {
        const dateA = new Date(a.createdAt).getTime()
        const dateB = new Date(b.createdAt).getTime()
        return sortOption === 'date-asc' ? dateA - dateB : dateB - dateA
      }
      
      if (sortOption.startsWith('price')) {
        const priceA = getUsdcPrice(a) ?? -1  // Put orders with no USDC price at the end
        const priceB = getUsdcPrice(b) ?? -1
        return sortOption === 'price-asc' ? priceA - priceB : priceB - priceA
      }
      
      const amountA = a.orderType === 'BUY' ? a.takingAmount : a.makingAmount
      const amountB = b.orderType === 'BUY' ? b.takingAmount : b.makingAmount
      return sortOption === 'amount-asc' ? amountA - amountB : amountB - amountA
    })
  }, [getUsdcPrice])

  const sortedBuyOrders = useMemo(() => 
    sortOrders(tokenOrders.filter(o => o.orderType === 'BUY'), buySort),
    [tokenOrders, sortOrders, buySort]
  )

  const sortedSellOrders = useMemo(() => 
    sortOrders(tokenOrders.filter(o => o.orderType === 'SELL'), sellSort),
    [tokenOrders, sortOrders, sellSort]
  )

  if (loading) {
    return <div className="text-center py-4">Loading orders...</div>
  }

  if (error) {
    return <div className="text-center py-4 text-red-500">Error loading orders: {error.message}</div>
  }

  return (
    <div className="flex flex-col min-h-0 h-full">
      {/* Summary Cards - Stack on mobile, side by side on desktop */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        <div className="bg-[#1e1f2e] p-4 rounded">
          <div>
            <div className="text-green-500 text-sm">Buy Orders</div>
            <div className="text-2xl font-bold">{tokenSummary.buyOrders}</div>
            <div className="text-sm">
              {tokenSummary.buyVolume.toLocaleString()} {tokenConfig.symbol}
              <div className="text-gray-400 italic">
                ${(tokenSummary.buyVolume * currentPrice).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} USDC
              </div>
            </div>
          </div>
        </div>
        
        <div className="bg-[#1e1f2e] p-4 rounded">
          <div>
            <div className="text-red-500 text-sm">Sell Orders</div>
            <div className="text-2xl font-bold">{tokenSummary.sellOrders}</div>
            <div className="text-sm">
              {tokenSummary.sellVolume.toLocaleString()} {tokenConfig.symbol}
              <div className="text-gray-400 italic">
                ${(tokenSummary.sellVolume * currentPrice).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} USDC
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Order Lists - Stack on mobile, side by side on desktop */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 flex-1">
        {/* Buy Orders */}
        <div className="bg-[#1e1f2e] rounded-lg flex flex-col h-[500px] md:h-[calc(100vh-16rem)]">
          <div className="p-1.5 border-b border-gray-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-green-500">•</span>
                <h3 className="text-xs font-medium">Buy Orders ({sortedBuyOrders.length})</h3>
              </div>
              <SortButton 
                currentSort={buySort} 
                onSortChange={setBuySort}
              />
            </div>
          </div>
          <div className="overflow-y-auto flex-1 p-2">
            {sortedBuyOrders.map(order => (
              <LimitOrderCard 
                key={order.id} 
                order={order}
                tokenPrices={tokenPrices}
              />
            ))}
          </div>
        </div>

        {/* Sell Orders */}
        <div className="bg-[#1e1f2e] rounded-lg flex flex-col h-[500px] md:h-[calc(100vh-16rem)]">
          <div className="p-1.5 border-b border-gray-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-red-500">•</span>
                <h3 className="text-xs font-medium">Sell Orders ({sortedSellOrders.length})</h3>
              </div>
              <SortButton 
                currentSort={sellSort} 
                onSortChange={setSellSort}
              />
            </div>
          </div>
          <div className="overflow-y-auto flex-1 p-2">
            {sortedSellOrders.map(order => (
              <LimitOrderCard 
                key={order.id} 
                order={order}
                tokenPrices={tokenPrices}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
} 