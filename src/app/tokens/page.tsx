'use client'

import { useEffect, useState } from 'react'

interface JupiterToken {
  address: string
  symbol: string
  name: string
  decimals: number
  tags?: string[]
  logoURI?: string
}

export default function TokensPage() {
  const [tokens, setTokens] = useState<JupiterToken[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('https://token.jup.ag/all')
      .then(res => res.json())
      .then(tokens => {
        setTokens(tokens)
        setLoading(false)
      })
  }, [])

  if (loading) return <div>Loading...</div>

  return (
    <div className="p-4">
      <h1>Jupiter Tokens ({tokens.length})</h1>
      <div className="space-y-4">
        {tokens.map(token => (
          <div key={token.address} className="border p-2 rounded">
            <div>Token: {token.symbol}</div>
            <div>Name: {token.name}</div>
            <div>Address: {token.address}</div>
            <div>Decimals: {token.decimals}</div>
            {token.tags?.length && <div>Tags: {token.tags.join(', ')}</div>}
          </div>
        ))}
      </div>
    </div>
  )
} 