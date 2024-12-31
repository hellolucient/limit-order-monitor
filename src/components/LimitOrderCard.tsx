'use client'

import React, { useEffect, useState } from 'react'
import { LimitOrder } from '../lib/types'
import { ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline'

const USDC_ADDRESS = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const USDT_ADDRESS = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'

interface Props {
  order: LimitOrder
  tokenPrices: Map<string, number>
}

export function LimitOrderCard({ order, tokenPrices }: Props) {
  const isBuy = order.orderType === 'BUY'
  const colorClass = isBuy ? 'text-green-400' : 'text-red-400'
  const [usdcPrice, setUsdcPrice] = useState<number | null>(null)
  const [totalUSDC, setTotalUSDC] = useState<number | null>(null)

  // For buy orders:
  // - Amount is what we're getting (takingAmount)
  // - Price is what we're paying per unit (makingAmount/takingAmount)
  // - Total is what we're paying (makingAmount)
  const amount = isBuy ? order.takingAmount : order.makingAmount
  const total = isBuy ? order.makingAmount : order.takingAmount

  useEffect(() => {
    const calculateUsdcValues = () => {
      const inputAddress = order.inputMint.address
      const outputAddress = order.outputMint.address

      // For USDT or USDC pairs, we can use the price directly
      if (inputAddress === USDT_ADDRESS || outputAddress === USDT_ADDRESS ||
          inputAddress === USDC_ADDRESS || outputAddress === USDC_ADDRESS) {
        setUsdcPrice(order.price)
        setTotalUSDC(total)
        return
      }

      // Get prices from the map
      const inputPrice = tokenPrices.get(inputAddress)
      const outputPrice = tokenPrices.get(outputAddress)

      if (inputPrice !== undefined && outputPrice !== undefined) {
        // Calculate USDC price
        const priceInUsdc = order.price * (inputPrice / outputPrice)
        setUsdcPrice(priceInUsdc)

        // Calculate total in USDC
        const totalInUsdc = total * (isBuy ? inputPrice : outputPrice)
        setTotalUSDC(totalInUsdc)
      } else {
        setUsdcPrice(null)
        setTotalUSDC(null)
      }
    }

    calculateUsdcValues()
  }, [order, isBuy, total, tokenPrices])

  // Format amounts based on token type
  const formatAmount = (value: number, symbol: string) => {
    if (symbol === 'CHAOS' || symbol === 'LOGOS') {
      return Math.round(value).toLocaleString('en-US', { maximumFractionDigits: 0 })
    }
    return value.toLocaleString('en-US', { maximumFractionDigits: 2 })
  }

  // Format price with consistent decimals
  const formatPrice = (value: number | null) => {
    if (value === null) return 'N/A'
    // For very small numbers (less than 0.000001), show more decimal places
    if (value > 0 && value < 0.000001) {
      return value.toLocaleString('en-US', { minimumFractionDigits: 12, maximumFractionDigits: 12 })
    }
    return value.toLocaleString('en-US', { minimumFractionDigits: 6, maximumFractionDigits: 6 })
  }

  // Format date to be more readable
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const month = date.toLocaleString('en-US', { month: 'short' })
    const day = date.getUTCDate()
    const hours = String(date.getUTCHours()).padStart(2, '0')
    const minutes = String(date.getUTCMinutes()).padStart(2, '0')
    return `${month} ${day}, ${hours}:${minutes} UTC`
  }

  const amountSymbol = isBuy ? order.outputMint.symbol : order.inputMint.symbol
  const totalSymbol = isBuy ? order.inputMint.symbol : order.outputMint.symbol
  const priceSymbol = isBuy ? `${totalSymbol}/${amountSymbol}` : `${totalSymbol}/${amountSymbol}`

  return (
    <div className="bg-[#1a1b23] p-3 border border-gray-700/50 rounded-lg mb-2">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1">
          <span className={`text-sm ${colorClass}`}>•</span>
          <span className={`text-sm ${colorClass}`}>{order.orderType}</span>
        </div>
        <div className="text-gray-400 text-xs">
          {formatDate(order.createdAt)}
        </div>
      </div>

      <div className="space-y-1 text-sm">
        <div className="flex justify-between items-center">
          <span className="text-gray-400">Amount:</span>
          <span>{formatAmount(amount, amountSymbol)} {amountSymbol}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-gray-400">Execution Price:</span>
          <div className="text-right">
            {formatPrice(order.price)} {priceSymbol}
            {usdcPrice !== null && (
              <div className="text-gray-400 text-xs">
                ≈ ${formatPrice(usdcPrice)} USDC/{amountSymbol}
              </div>
            )}
            {usdcPrice === null && (
              <div className="text-gray-400 text-xs">
                USDC price not available
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-gray-400">Total:</span>
          <div className="text-right">
            {formatAmount(total, totalSymbol)} {totalSymbol}
            {totalUSDC !== null && (
              <div className="text-gray-400 text-xs">
                ≈ ${formatAmount(totalUSDC, 'USDC')} USDC
              </div>
            )}
            {totalUSDC === null && (
              <div className="text-gray-400 text-xs">
                USDC total not available
              </div>
            )}
          </div>
        </div>
        <div className="pt-1 border-t border-gray-700/50">
          <a
            href={`https://solscan.io/account/${order.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-gray-400 hover:text-gray-300 transition-colors text-xs"
          >
            <ArrowTopRightOnSquareIcon className="w-3 h-3" />
            View on Solscan
          </a>
        </div>
      </div>
    </div>
  )
}