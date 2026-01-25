'use client'

import React, { useState, useEffect } from 'react';
import { TokenInfo, getTokenByMint } from '../lib/types'

interface Props {
  onTokenSelect?: (token: TokenInfo) => void
}

export function TokenInput({ onTokenSelect }: Props) {
  const [address, setValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    console.log('TokenInput mounted')
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Form submitted with address:', address)
    setIsLoading(true);
    setError(null);

    try {
      console.log('Looking up token...')
      // Use allowBackgroundFetch=false to ensure we wait for metadata
      const token = await getTokenByMint(address, false);
      console.log('Token lookup result:', token)
      
      if (token && onTokenSelect) {
        console.log('Calling onTokenSelect with:', token)
        onTokenSelect(token);
      } else {
        console.log('Token not found')
        // Only show error if token is truly invalid (not just missing metadata)
        // If we got a token back (even with "Unknown Token" name), it's valid
        if (!token) {
          setError('Token not found');
        } else if (onTokenSelect) {
          // Token exists but might not have metadata - that's okay
          onTokenSelect(token);
        }
      }
    } catch (error) {
      console.error('Error:', error);
      setError('Failed to look up token');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={address}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Enter token address..."
          className="flex-1 p-1.5 rounded-md border border-gray-600 bg-gray-800 text-white text-sm"
          required
          disabled={isLoading}
        />
        <button 
          type="submit"
          disabled={isLoading}
          className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {isLoading ? '...' : 'Track'}
        </button>
      </div>
      {error && (
        <div className="text-red-500 text-xs">{error}</div>
      )}
    </form>
  );
} 