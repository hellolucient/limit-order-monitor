'use client'

import { useState, useEffect } from 'react'
import { Connection } from '@solana/web3.js'
import { JupiterLimitOrdersAPI } from '../client'
import { LimitOrder } from '../types'
import { useAutoRefresh } from './useAutoRefresh'

interface OrderSummary {
  buyOrders: number
  sellOrders: number
  buyVolume: number
  sellVolume: number
}

type Summary = Record<'CHAOS' | 'LOGOS', OrderSummary>

export function useLimitOrders(autoRefresh = false) {
  const [connection] = useState(() => {
    const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL
    if (!rpcUrl) {
      console.warn('No RPC URL provided, using fallback')
      return new Connection('https://api.mainnet-beta.solana.com')
    }
    return new Connection(rpcUrl)
  })
  const [orders, setOrders] = useState<LimitOrder[]>([])
  const [summary, setSummary] = useState<Summary>({
    CHAOS: { buyOrders: 0, sellOrders: 0, buyVolume: 0, sellVolume: 0 },
    LOGOS: { buyOrders: 0, sellOrders: 0, buyVolume: 0, sellVolume: 0 }
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchOrders = async () => {
    try {
      console.log('🔄 Fetching orders...')
      const api = new JupiterLimitOrdersAPI(connection)
      const orders = await api.getLimitOrders()
      
      // Calculate summary
      const newSummary: Summary = {
        CHAOS: { buyOrders: 0, sellOrders: 0, buyVolume: 0, sellVolume: 0 },
        LOGOS: { buyOrders: 0, sellOrders: 0, buyVolume: 0, sellVolume: 0 }
      }

      orders.forEach(order => {
        const stats = newSummary[order.tokenType]
        if (order.orderType === 'BUY') {
          stats.buyOrders++
          stats.buyVolume += order.takingAmount
        } else {
          stats.sellOrders++
          stats.sellVolume += order.makingAmount
        }
      })

      setOrders(orders)
      setSummary(newSummary)
      setError(null)
    } catch (err) {
      console.error('Error fetching orders:', err)
      setError(err instanceof Error ? err : new Error('Failed to fetch orders'))
    } finally {
      setLoading(false)
    }
  }

  // Initial fetch
  useEffect(() => {
    fetchOrders()
  }, [])

  // Auto refresh
  useAutoRefresh(fetchOrders, autoRefresh)

  return {
    orders,
    summary,
    loading,
    error,
    refresh: fetchOrders
  }
}