import React, { useState, useRef } from 'react';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { AxisDomain } from 'recharts/types/util/types';

interface OrderData {
  x: number;  // USDC price
  y: number;  // CHAOS volume
  timestamp: number;
  orderCount: number;
}

interface OrderBookChartProps {
  buyOrders: OrderData[];
  sellOrders: OrderData[];
  tokenSymbol: string;
}

interface TooltipProps {
  active?: boolean;
  payload?: any[];
  label?: any;
  tokenSymbol?: string;
}

const DOT_SIZE = 6;  // Consistent dot size

const CustomDot = (props: any) => {
  const { cx, cy, fill } = props;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={DOT_SIZE}
      fill={fill}
      fillOpacity={0.8}
      stroke="none"
    />
  );
};

const CustomTooltip = ({ active, payload, tokenSymbol }: TooltipProps) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-[#1e1f2e] p-2 rounded text-xs space-y-0.5">
        <p className="text-gray-200">Price: ${data.x.toFixed(6)} USDC</p>
        <p className="text-gray-400">Volume: {data.y.toLocaleString()} {tokenSymbol}</p>
        <p className="text-gray-400">Orders: {data.orderCount}</p>
      </div>
    );
  }
  return null;
};

export const OrderBookChart: React.FC<OrderBookChartProps> = ({ buyOrders, sellOrders, tokenSymbol }) => {
  // Buy orders should be in descending order (highest price first)
  const sortedBuyOrders = [...buyOrders].sort((a, b) => b.x - a.x);
  // Sell orders stay in ascending order (lowest price first)
  const sortedSellOrders = [...sellOrders].sort((a, b) => a.x - b.x);

  // State for chart domains
  const [buyDomain, setBuyDomain] = useState<{ x: [number, number]; y: [number, number] }>({
    x: [0, Math.max(0.000001, ...buyOrders.map(o => o.x))],
    y: [0, Math.max(0.000001, Math.ceil(Math.max(...buyOrders.map(o => o.y)) * 1.1))]
  });
  const [sellDomain, setSellDomain] = useState<{ x: [number, number]; y: [number, number] }>({
    x: [0, Math.max(0.000001, ...sellOrders.map(o => o.x))],
    y: [0, Math.max(0.000001, Math.ceil(Math.max(...sellOrders.map(o => o.y)) * 1.1))]
  });

  // Track last double click time to prevent single clicks
  const lastClickTime = useRef<{ buy: number; sell: number }>({ buy: 0, sell: 0 });

  const handleChartClick = (chart: 'buy' | 'sell', event: any) => {
    if (!event) return;
    
    const now = Date.now();
    const lastClick = lastClickTime.current[chart];
    lastClickTime.current[chart] = now;
    
    // Check if it's a double click (within 300ms)
    if (now - lastClick > 300) return;

    // Get click coordinates relative to the chart
    const { chartX, chartY, xValue, yValue } = event;
    if (typeof xValue !== 'number' || typeof yValue !== 'number') return;

    // Calculate new domain centered on click with 50% zoom
    const setDomain = chart === 'buy' ? setBuyDomain : setSellDomain;
    const currentDomain = chart === 'buy' ? buyDomain : sellDomain;
    const orders = chart === 'buy' ? buyOrders : sellOrders;
    
    // Calculate X range for zoom
    const xRange = currentDomain.x[1] - currentDomain.x[0];
    const newXMin = Math.max(0, xValue - xRange * 0.25);
    const newXMax = xValue + xRange * 0.25;

    // Find visible orders and calculate Y range
    const visibleOrders = orders.filter(o => o.x >= newXMin && o.x <= newXMax);
    const maxY = Math.max(0.000001, Math.ceil(Math.max(...visibleOrders.map(o => o.y)) * 1.1));
    
    setDomain({
      x: [newXMin, newXMax],
      y: [0, maxY]
    });
  };

  const handleResetZoom = (chart: 'buy' | 'sell') => {
    if (chart === 'buy') {
      setBuyDomain({
        x: [0, Math.max(0.000001, ...buyOrders.map(o => o.x))],
        y: [0, Math.max(0.000001, Math.ceil(Math.max(...buyOrders.map(o => o.y)) * 1.1))]
      });
    } else {
      setSellDomain({
        x: [0, Math.max(0.000001, ...sellOrders.map(o => o.x))],
        y: [0, Math.max(0.000001, Math.ceil(Math.max(...sellOrders.map(o => o.y)) * 1.1))]
      });
    }
  };

  return (
    <div className="grid grid-cols-2 gap-4 h-full">
      <div className="bg-[#1e1f2e] rounded-lg p-2">
        <div className="flex justify-between items-center px-2 mb-2">
          <h3 className="text-green-500 text-sm font-medium">Buy Orders</h3>
          <div className="flex items-center space-x-2">
            <span className="text-gray-400 text-xs">Double-click to Zoom</span>
            <button 
              onClick={() => handleResetZoom('buy')}
              className="text-gray-400 text-xs hover:text-gray-200"
            >
              Reset Zoom
            </button>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <ScatterChart 
            margin={{ top: 10, right: 10, bottom: 20, left: 60 }}
            onClick={(e) => handleChartClick('buy', e)}
            className="cursor-zoom-in"
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#2d2e3d" strokeOpacity={0.5} />
            <XAxis
              dataKey="x"
              type="number"
              domain={buyDomain.x}
              tick={{ fill: '#9ca3af', fontSize: 11 }}
              tickFormatter={(value) => value.toFixed(6)}
              label={{ 
                value: 'Price (USDC)', 
                position: 'bottom', 
                fill: '#9ca3af',
                offset: 10,
                fontSize: 11
              }}
              allowDataOverflow
            />
            <YAxis
              dataKey="y"
              type="number"
              domain={buyDomain.y}
              tick={{ fill: '#9ca3af', fontSize: 11 }}
              tickCount={5}
              tickFormatter={(value) => {
                if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
                if (value >= 1000) return `${Math.round(value / 1000)}K`;
                return Math.round(value).toString();
              }}
              label={{ 
                value: `Volume (${tokenSymbol})`, 
                angle: -90, 
                position: 'center',
                fill: '#9ca3af',
                fontSize: 11,
                dx: -40,
                dy: 0
              }}
              allowDataOverflow
            />
            <Tooltip content={<CustomTooltip tokenSymbol={tokenSymbol} />} />
            <Scatter 
              data={sortedBuyOrders}
              fill="#22c55e"
              shape={<CustomDot />}
              isAnimationActive={false}
            />
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-[#1e1f2e] rounded-lg p-2">
        <div className="flex justify-between items-center px-2 mb-2">
          <h3 className="text-red-500 text-sm font-medium">Sell Orders</h3>
          <div className="flex items-center space-x-2">
            <span className="text-gray-400 text-xs">Double-click to Zoom</span>
            <button 
              onClick={() => handleResetZoom('sell')}
              className="text-gray-400 text-xs hover:text-gray-200"
            >
              Reset Zoom
            </button>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <ScatterChart 
            margin={{ top: 10, right: 10, bottom: 20, left: 60 }}
            onClick={(e) => handleChartClick('sell', e)}
            className="cursor-zoom-in"
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#2d2e3d" strokeOpacity={0.5} />
            <XAxis
              dataKey="x"
              type="number"
              domain={sellDomain.x}
              tick={{ fill: '#9ca3af', fontSize: 11 }}
              tickFormatter={(value) => value.toFixed(6)}
              label={{ 
                value: 'Price (USDC)', 
                position: 'bottom', 
                fill: '#9ca3af',
                offset: 10,
                fontSize: 11
              }}
              allowDataOverflow
            />
            <YAxis
              dataKey="y"
              type="number"
              domain={sellDomain.y}
              tick={{ fill: '#9ca3af', fontSize: 11 }}
              tickCount={5}
              tickFormatter={(value) => {
                if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
                if (value >= 1000) return `${Math.round(value / 1000)}K`;
                return Math.round(value).toString();
              }}
              label={{ 
                value: `Volume (${tokenSymbol})`, 
                angle: -90, 
                position: 'center',
                fill: '#9ca3af',
                fontSize: 11,
                dx: -40,
                dy: 0
              }}
              allowDataOverflow
            />
            <Tooltip content={<CustomTooltip tokenSymbol={tokenSymbol} />} />
            <Scatter 
              data={sortedSellOrders}
              fill="#ef4444"
              shape={<CustomDot />}
              isAnimationActive={false}
            />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}; 