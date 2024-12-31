'use client'

import React from 'react'
import { ArrowPathIcon } from '@heroicons/react/24/outline'

export type SortOption = 'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc' | 'price-desc' | 'price-asc'

interface SortButtonProps {
  currentSort: SortOption
  onSortChange: (sort: SortOption) => void
}

export function SortButton({ currentSort, onSortChange }: SortButtonProps) {
  return (
    <div className="flex items-center gap-1">
      <select 
        value={currentSort}
        onChange={(e) => onSortChange(e.target.value as SortOption)}
        className="bg-gray-800 text-white border border-gray-700 rounded px-2 py-0.5 text-xs"
      >
        <option value="date-desc">Date (Newest)</option>
        <option value="date-asc">Date (Oldest)</option>
        <option value="amount-desc">Amount (High to Low)</option>
        <option value="amount-asc">Amount (Low to High)</option>
        <option value="price-desc">Price (High to Low)</option>
        <option value="price-asc">Price (Low to High)</option>
      </select>
      <button 
        onClick={() => onSortChange('date-desc')}
        className="text-gray-400 hover:text-gray-300"
        title="Reset to newest first"
      >
        <ArrowPathIcon className="w-3 h-3" />
      </button>
    </div>
  )
} 