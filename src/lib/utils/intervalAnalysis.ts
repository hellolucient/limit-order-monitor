import { LimitOrder } from '../types/limitOrder'

export interface PriceInterval {
  minPrice: number
  maxPrice: number
  orderCount: number
  totalVolume: number
  averagePrice: number
  orders: LimitOrder[]
}

/**
 * Analyzes orders and identifies price intervals where orders are clustered
 * Separates orders by quote currency first, then finds intervals within each currency group
 * @param orders Array of limit orders (can be buy or sell)
 * @param intervalSize Size of each price interval (as a percentage, e.g., 0.05 for 5%)
 * @param minOrders Minimum number of orders required to form an interval
 * @returns Array of identified price intervals
 */
export function findOrderIntervals(
  orders: LimitOrder[],
  intervalSize: number = 0.05, // 5% intervals by default
  minOrders: number = 2
): PriceInterval[] {
  if (orders.length === 0) return []

  // First, group orders by quote currency
  // For buy orders: quote currency is inputMint (what you're paying with)
  // For sell orders: quote currency is outputMint (what you're receiving)
  const ordersByQuoteCurrency = new Map<string, LimitOrder[]>()
  
  orders.forEach(order => {
    const quoteCurrency = order.orderType === 'BUY' 
      ? order.inputMint.address  // Paying with inputMint
      : order.outputMint.address // Receiving outputMint
    
    if (!ordersByQuoteCurrency.has(quoteCurrency)) {
      ordersByQuoteCurrency.set(quoteCurrency, [])
    }
    ordersByQuoteCurrency.get(quoteCurrency)!.push(order)
  })

  // Find intervals for each quote currency group
  const allIntervals: PriceInterval[] = []
  
  ordersByQuoteCurrency.forEach((currencyOrders, quoteCurrencyAddress) => {
    if (currencyOrders.length < minOrders) return

    // Sort orders by price (ascending)
    const sortedOrders = [...currencyOrders].sort((a, b) => a.price - b.price)

    // Find min and max prices
    const minPrice = sortedOrders[0].price
    const maxPrice = sortedOrders[sortedOrders.length - 1].price

    // Calculate interval size in absolute terms
    const priceRange = maxPrice - minPrice
    
    // If all orders are at the same price, create a single interval
    if (priceRange === 0) {
      const totalVolume = sortedOrders.reduce((sum, order) => {
        return sum + (order.orderType === 'BUY' ? order.takingAmount : order.makingAmount)
      }, 0)
      
      allIntervals.push({
        minPrice: minPrice,
        maxPrice: maxPrice,
        orderCount: sortedOrders.length,
        totalVolume,
        averagePrice: minPrice,
        orders: sortedOrders
      })
      return
    }
    
    // Try different interval sizes if needed
    let foundIntervals = false
    let currentIntervalSize = intervalSize
    
    // Try up to 3 different interval sizes (5%, 10%, 20%)
    for (let attempt = 0; attempt < 3 && !foundIntervals; attempt++) {
      const absoluteIntervalSize = priceRange * currentIntervalSize
      const intervals: PriceInterval[] = []
      let currentIntervalStart = minPrice

      while (currentIntervalStart <= maxPrice) {
        const currentIntervalEnd = currentIntervalStart + absoluteIntervalSize
        const ordersInInterval = sortedOrders.filter(
          order => order.price >= currentIntervalStart && order.price < currentIntervalEnd
        )

        if (ordersInInterval.length >= minOrders) {
          const totalVolume = ordersInInterval.reduce((sum, order) => {
            // For buy orders: volume is takingAmount (what they're getting)
            // For sell orders: volume is makingAmount (what they're giving)
            return sum + (order.orderType === 'BUY' ? order.takingAmount : order.makingAmount)
          }, 0)

          const averagePrice = ordersInInterval.reduce((sum, order) => sum + order.price, 0) / ordersInInterval.length

          intervals.push({
            minPrice: currentIntervalStart,
            maxPrice: currentIntervalEnd,
            orderCount: ordersInInterval.length,
            totalVolume,
            averagePrice,
            orders: ordersInInterval
          })
        }

        currentIntervalStart = currentIntervalEnd
      }
      
      if (intervals.length > 0) {
        allIntervals.push(...intervals)
        foundIntervals = true
      } else {
        // Try larger intervals
        currentIntervalSize *= 2
      }
    }
    
    // If still no intervals found, try proximity-based clustering
    // Group orders that are within 10% of each other
    if (!foundIntervals && sortedOrders.length >= minOrders) {
      const proximityIntervals: PriceInterval[] = []
      const processed = new Set<number>()
      
      for (let i = 0; i < sortedOrders.length; i++) {
        if (processed.has(i)) continue
        
        const basePrice = sortedOrders[i].price
        const cluster: LimitOrder[] = [sortedOrders[i]]
        processed.add(i)
        
        // Find all orders within 10% of this price
        for (let j = i + 1; j < sortedOrders.length; j++) {
          if (processed.has(j)) continue
          const priceDiff = Math.abs(sortedOrders[j].price - basePrice) / basePrice
          if (priceDiff <= 0.1) { // Within 10%
            cluster.push(sortedOrders[j])
            processed.add(j)
          }
        }
        
        if (cluster.length >= minOrders) {
          const sortedCluster = cluster.sort((a, b) => a.price - b.price)
          const totalVolume = sortedCluster.reduce((sum, order) => {
            return sum + (order.orderType === 'BUY' ? order.takingAmount : order.makingAmount)
          }, 0)
          const averagePrice = sortedCluster.reduce((sum, order) => sum + order.price, 0) / sortedCluster.length
          
          proximityIntervals.push({
            minPrice: sortedCluster[0].price,
            maxPrice: sortedCluster[sortedCluster.length - 1].price,
            orderCount: sortedCluster.length,
            totalVolume,
            averagePrice,
            orders: sortedCluster
          })
        }
      }
      
      if (proximityIntervals.length > 0) {
        allIntervals.push(...proximityIntervals)
      }
    }
  })

  return allIntervals
}

/**
 * Legacy function for backward compatibility - analyzes sell orders
 * @deprecated Use findOrderIntervals instead
 */
export function findSellIntervals(
  sellOrders: LimitOrder[],
  intervalSize: number = 0.05,
  minOrders: number = 2
): PriceInterval[] {
  return findOrderIntervals(sellOrders, intervalSize, minOrders)
}

/**
 * Finds the most attractive sell intervals (highest volume, most orders)
 * @param intervals Array of price intervals
 * @param limit Maximum number of intervals to return
 * @returns Top intervals sorted by attractiveness
 */
export function getTopIntervals(
  intervals: PriceInterval[],
  limit: number = 5
): PriceInterval[] {
  return [...intervals]
    .sort((a, b) => {
      // Sort by order count first, then by volume
      if (b.orderCount !== a.orderCount) {
        return b.orderCount - a.orderCount
      }
      return b.totalVolume - a.totalVolume
    })
    .slice(0, limit)
}

/**
 * Converts a single order into a PriceInterval for use in the trade interface
 * @param order The limit order to convert
 * @returns A PriceInterval containing just this order
 */
export function orderToInterval(order: LimitOrder): PriceInterval {
  const volume = order.orderType === 'BUY' ? order.takingAmount : order.makingAmount
  
  return {
    minPrice: order.price,
    maxPrice: order.price,
    orderCount: 1,
    totalVolume: volume,
    averagePrice: order.price,
    orders: [order]
  }
}
