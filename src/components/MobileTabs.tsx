'use client'

import React from 'react'

export type TabType = 'terminal' | 'track'

interface MobileTabsProps {
  activeTab: TabType
  onTabChange: (tab: TabType) => void
}

export function MobileTabs({ activeTab, onTabChange }: MobileTabsProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-[#1a1b23] border-t border-gray-800 z-50 safe-area-bottom">
      <div className="flex items-center justify-around h-16">
        <button
          onClick={() => onTabChange('terminal')}
          className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
            activeTab === 'terminal'
              ? 'text-green-500'
              : 'text-gray-500'
          }`}
        >
          <svg
            className="w-6 h-6 mb-1"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <span className="text-xs font-medium">Terminal</span>
        </button>

        <button
          onClick={() => onTabChange('track')}
          className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
            activeTab === 'track'
              ? 'text-green-500'
              : 'text-gray-500'
          }`}
        >
          <svg
            className="w-6 h-6 mb-1"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
          </svg>
          <span className="text-xs font-medium">Track</span>
        </button>
      </div>
    </div>
  )
}
