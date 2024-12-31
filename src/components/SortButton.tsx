'use client'

import React from 'react'

export type SortOption = 'amount-desc' | 'amount-asc' | 'date-desc' | 'date-asc' | 'price-desc' | 'price-asc'

interface SortButtonProps {
  currentSort: SortOption
  onSortChange: (sort: SortOption) => void
}

export function SortButton({ currentSort, onSortChange }: SortButtonProps) {
  return (
    <select 
      value={currentSort}
      onChange={(e) => onSortChange(e.target.value as SortOption)}
      className="bg-gray-800 text-white border border-gray-700 rounded px-3 py-1 text-sm"
    >
      <option value="amount-desc">Amount (High to Low)</option>
      <option value="amount-asc">Amount (Low to High)</option>
      <option value="price-desc">Price (High to Low)</option>
      <option value="price-asc">Price (Low to High)</option>
      <option value="date-desc">Date (Newest First)</option>
      <option value="date-asc">Date (Oldest First)</option>
    </select>
  )
} 