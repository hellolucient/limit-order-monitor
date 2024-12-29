'use client'

import React, { useEffect, useState } from 'react'
import type { LimitOrder } from '../lib/types'
import { PriceService } from '../lib/services/PriceService'
import { ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline'

interface LimitOrderCardProps {
  order: LimitOrder
}

export function LimitOrderCard({ order }: LimitOrderCardProps) {
  const isBuy = order.orderType === 'BUY'
  const colorClass = isBuy ? 'text-green-500' : 'text-red-500'
  const dotColorClass = isBuy ? 'bg-green-500' : 'bg-red-500'
  const [usdcPrice, setUsdcPrice] = useState<number | null>(null)
  const [totalUSDC, setTotalUSDC] = useState<number | null>(null)

  // For buy orders:
  // - Amount is what we're getting (takingAmount)
  // - Price is what we're paying per unit (makingAmount/takingAmount)
  // - Total is what we're paying (makingAmount)
  const amount = isBuy ? order.takingAmount : order.makingAmount
  const total = isBuy ? order.makingAmount : order.takingAmount

  useEffect(() => {
    const fetchUsdcPrices = async () => {
      const priceService = PriceService.getInstance()
      const inputSymbol = order.inputMint.symbol
      const outputSymbol = order.outputMint.symbol

      // For USDT pairs, we can use the price directly as USDC (1:1 peg)
      if (inputSymbol === 'USDT' || outputSymbol === 'USDT') {
        setUsdcPrice(order.price)
        setTotalUSDC(total)
        return
      }

      // Skip if already in USDC
      if (inputSymbol === 'USDC' || outputSymbol === 'USDC') {
        setUsdcPrice(order.price)
        setTotalUSDC(total)
        return
      }

      try {
        // Convert execution price to USDC
        const priceInUsdc = await priceService.convertExecutionPrice(
          order.price,
          inputSymbol,
          outputSymbol
        )
        setUsdcPrice(priceInUsdc || null)

        // Convert total to USDC
        const totalInUsdc = await priceService.convertToUsdc(
          total,
          isBuy ? inputSymbol : outputSymbol
        )
        setTotalUSDC(totalInUsdc)
      } catch (error) {
        console.error('Error converting prices to USDC:', error)
      }
    }

    fetchUsdcPrices()
  }, [order, isBuy, total])

  // Format amounts based on token type
  const formatAmount = (value: number, symbol: string) => {
    if (symbol === 'CHAOS' || symbol === 'LOGOS') {
      return Math.round(value).toLocaleString('en-US', { maximumFractionDigits: 0 })
    }
    return value.toLocaleString('en-US', { maximumFractionDigits: 2 })
  }

  // Format price with consistent decimals
  const formatPrice = (value: number) => {
    // For very small numbers (less than 0.000001), show more decimal places
    if (value > 0 && value < 0.000001) {
      return value.toLocaleString('en-US', { minimumFractionDigits: 12, maximumFractionDigits: 12 })
    }
    return value.toLocaleString('en-US', { minimumFractionDigits: 6, maximumFractionDigits: 6 })
  }

  // Format date to be more readable
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleString('en-US', {
      timeZone: 'UTC',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hour12: true,
      timeZoneName: 'short'
    })
  }

  const amountSymbol = isBuy ? order.outputMint.symbol : order.inputMint.symbol
  const totalSymbol = isBuy ? order.inputMint.symbol : order.outputMint.symbol
  const priceSymbol = isBuy ? `${totalSymbol}/${amountSymbol}` : `${totalSymbol}/${amountSymbol}`

  // Determine if we should show USDC price as primary
  const showUsdcAsPrimary = totalSymbol !== 'USDC'

  return (
    <div className="bg-[#1e1f2e] rounded-lg p-4 mb-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center">
          <div className={`w-2 h-2 rounded-full ${dotColorClass}`} />
          <span className={`ml-2 font-medium ${colorClass}`}>{order.orderType}</span>
        </div>
        <div className="text-gray-400 text-sm">
          {formatDate(order.createdAt)}
        </div>
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span>Amount:</span>
          <span>{formatAmount(amount, amountSymbol)} {amountSymbol}</span>
        </div>
        <div className="flex justify-between">
          <span>Execution Price:</span>
          <div className="text-right">
            {showUsdcAsPrimary && usdcPrice !== null ? (
              <>
                <div>≈ ${formatPrice(usdcPrice)} USDC/{amountSymbol}</div>
                <div className="text-gray-400 text-xs">
                  {formatPrice(order.price)} {priceSymbol}
                </div>
              </>
            ) : (
              <div>{formatPrice(order.price)} {priceSymbol}</div>
            )}
          </div>
        </div>
        <div className="flex justify-between">
          <span>Total:</span>
          <div className="text-right">
            {showUsdcAsPrimary && totalUSDC !== null ? (
              <>
                <div>≈ ${formatAmount(totalUSDC, 'USDC')} USDC</div>
                <div className="text-gray-400 text-xs">
                  {formatAmount(total, totalSymbol)} {totalSymbol}
                </div>
              </>
            ) : (
              <div>{formatAmount(total, totalSymbol)} {totalSymbol}</div>
            )}
          </div>
        </div>
        <div className="pt-2 border-t border-gray-700">
          <a
            href={`https://solscan.io/account/${order.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-gray-400 hover:text-gray-300 transition-colors"
          >
            <ArrowTopRightOnSquareIcon className="w-4 h-4" />
            View on Solscan
          </a>
        </div>
      </div>
    </div>
  )
}