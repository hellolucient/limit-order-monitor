export interface OrderPoint {
  x: number  // Price
  y: number  // Volume
  timestamp: number
  orderCount: number
}

export interface ChartData {
  buyOrders: OrderPoint[]
  sellOrders: OrderPoint[]
}