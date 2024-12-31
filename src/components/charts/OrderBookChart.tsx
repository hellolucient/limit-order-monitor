import React from 'react';
import {
  ComposedChart,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Area,
} from 'recharts';
import { OrderPoint } from '../../lib/types/chart';

interface OrderBookChartProps {
  buyOrders: OrderPoint[];
  sellOrders: OrderPoint[];
  tokenSymbol: string;
}

export function OrderBookChart({ buyOrders, sellOrders, tokenSymbol }: OrderBookChartProps) {
  return (
    <div className="h-full w-full p-2">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={[...buyOrders, ...sellOrders]}
          margin={{ top: 5, right: 5, bottom: 5, left: 5 }}
        >
          <XAxis
            dataKey="x"
            type="number"
            domain={['dataMin', 'dataMax']}
            tickFormatter={(value) => value.toFixed(6)}
            tick={{ fontSize: 10, fill: '#9ca3af' }}
            tickLine={{ stroke: '#4b5563' }}
            axisLine={{ stroke: '#4b5563' }}
          />
          <YAxis
            type="number"
            domain={['dataMin', 'dataMax']}
            tickFormatter={(value) => formatCompactNumber(value)}
            tick={{ fontSize: 10, fill: '#9ca3af' }}
            tickLine={{ stroke: '#4b5563' }}
            axisLine={{ stroke: '#4b5563' }}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const data = payload[0].payload as OrderPoint
              return (
                <div className="bg-gray-900 border border-gray-700 p-2 text-xs rounded shadow">
                  <div>Price: {data.x.toFixed(6)}</div>
                  <div>Amount: {formatNumber(data.y)} {tokenSymbol}</div>
                  <div>Orders: {data.orderCount}</div>
                </div>
              )
            }}
          />
          {/* Buy Orders */}
          <Area
            dataKey="y"
            data={buyOrders}
            type="stepAfter"
            fill="#22c55e20"
            stroke="#22c55e"
            strokeWidth={1}
            fillOpacity={0.2}
          />
          {/* Sell Orders */}
          <Area
            dataKey="y"
            data={sellOrders}
            type="stepAfter"
            fill="#ef444420"
            stroke="#ef4444"
            strokeWidth={1}
            fillOpacity={0.2}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// Helper function for compact number formatting
function formatCompactNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return value.toFixed(1)
}

function formatNumber(value: number): string {
  return value.toLocaleString('en-US', {
    maximumFractionDigits: 2
  })
} 