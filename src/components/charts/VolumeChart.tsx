'use client'

import React, { useState } from 'react'
import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions,
  Scale,
  CoreScaleOptions
} from 'chart.js'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
)

interface VolumeChartProps {
  buyVolume: number[]
  sellVolume: number[]
  buyOrders: number
  sellOrders: number
  mode?: 'daily' | 'weekly'
}

export function VolumeChart({ 
  buyVolume, 
  sellVolume, 
  buyOrders,
  sellOrders,
  mode: initialMode = 'daily' 
}: VolumeChartProps) {
  const [mode, setMode] = useState<'daily' | 'weekly'>(initialMode)

  // Generate mock time series data based on current volumes or orders
  const generateTimeSeriesData = (value: number) => {
    const baseValue = value * 0.8
    const variationValue = value * 0.2

    if (mode === 'daily') {
      return Array.from({ length: 24 }, () => {
        return baseValue + (Math.random() * variationValue)
      })
    } else {
      return Array.from({ length: 7 }, () => {
        return baseValue + (Math.random() * variationValue)
      })
    }
  }

  const labels = mode === 'daily' 
    ? Array.from({ length: 24 }, (_, i) => `${i}:00`)
    : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  const data = {
    labels,
    datasets: [
      {
        label: 'Buy Volume',
        data: generateTimeSeriesData(buyVolume[0]),
        borderColor: 'rgb(34, 197, 94)',
        backgroundColor: 'rgba(34, 197, 94, 0.1)',
        tension: 0.4,
        fill: true,
        yAxisID: 'y'
      },
      {
        label: 'Sell Volume',
        data: generateTimeSeriesData(sellVolume[0]),
        borderColor: 'rgb(239, 68, 68)',
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        tension: 0.4,
        fill: true,
        yAxisID: 'y'
      },
      {
        label: 'Buy Orders',
        data: generateTimeSeriesData(buyOrders),
        borderColor: 'rgb(34, 197, 94)',
        backgroundColor: 'transparent',
        borderDash: [5, 5],
        tension: 0.4,
        fill: false,
        yAxisID: 'y1'
      },
      {
        label: 'Sell Orders',
        data: generateTimeSeriesData(sellOrders),
        borderColor: 'rgb(239, 68, 68)',
        backgroundColor: 'transparent',
        borderDash: [5, 5],
        tension: 0.4,
        fill: false,
        yAxisID: 'y1'
      }
    ]
  }

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          color: 'rgb(156, 163, 175)'
        }
      },
      tooltip: {
        callbacks: {
          label: function(context) {
            let label = context.dataset.label || ''
            if (label) {
              label += ': '
              if (label.includes('Volume')) {
                label += Number(context.raw).toLocaleString()
              } else {
                label += Math.round(Number(context.raw))
              }
            }
            return label
          }
        }
      }
    },
    scales: {
      x: {
        type: 'category',
        grid: {
          color: 'rgba(75, 85, 99, 0.2)'
        },
        ticks: {
          color: 'rgb(156, 163, 175)'
        }
      },
      y: {
        type: 'linear',
        display: true,
        position: 'left',
        title: {
          display: true,
          text: 'Volume',
          color: 'rgb(156, 163, 175)'
        },
        grid: {
          color: 'rgba(75, 85, 99, 0.2)'
        },
        ticks: {
          color: 'rgb(156, 163, 175)',
          callback(this: Scale<CoreScaleOptions>, tickValue: string | number) {
            return Number(tickValue).toLocaleString()
          }
        }
      },
      y1: {
        type: 'linear',
        display: true,
        position: 'right',
        title: {
          display: true,
          text: 'Orders',
          color: 'rgb(156, 163, 175)'
        },
        grid: {
          drawOnChartArea: false,
        },
        ticks: {
          color: 'rgb(156, 163, 175)',
          callback(this: Scale<CoreScaleOptions>, tickValue: string | number) {
            return Math.round(Number(tickValue))
          }
        }
      }
    }
  }

  return (
    <div className="relative h-full">
      <div className="absolute top-0 right-0 flex gap-2">
        <button
          className={`px-2 py-1 text-xs rounded ${
            mode === 'daily' ? 'bg-blue-600' : 'bg-gray-700'
          }`}
          onClick={() => setMode('daily')}
        >
          24H
        </button>
        <button
          className={`px-2 py-1 text-xs rounded ${
            mode === 'weekly' ? 'bg-blue-600' : 'bg-gray-700'
          }`}
          onClick={() => setMode('weekly')}
        >
          7D
        </button>
      </div>
      <Line data={data} options={options} />
    </div>
  )
}