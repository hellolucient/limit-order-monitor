'use client'

import { useState, useEffect, useCallback } from 'react'
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

export function useLimitOrders(tokenAddress: string, autoRefresh = false) {
  const [orders, setOrders] = useState<LimitOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchOrders = useCallback(async () => {
    if (!tokenAddress) return;
    
    try {
      console.log('Fetching orders for token:', tokenAddress);
      const api = new JupiterLimitOrdersAPI()
      const orders = await api.getOrders(tokenAddress)
      console.log('Fetched orders:', orders)
      setOrders(orders)
    } catch (error) {
      console.error('Failed to fetch orders:', error)
      setError(error as Error)
    } finally {
      setLoading(false)
    }
  }, [tokenAddress])

  useEffect(() => {
    console.log('useLimitOrders effect running')
    fetchOrders()
  }, [fetchOrders])

  return {
    orders,
    loading,
    error,
    refresh: fetchOrders
  }
}