import { NextResponse } from 'next/server'

interface JupiterToken {
  address: string
  symbol: string
  name: string
  decimals: number
  tags?: string[]
  logoURI?: string
}

export async function GET() {
  try {
    const response = await fetch('https://token.jup.ag/all')
    const tokens = await response.json() as JupiterToken[]
    
    return NextResponse.json({
      count: tokens.length,
      tokens: tokens
    })
  } catch (error) {
    console.error('Failed to fetch tokens:', error)
    return NextResponse.json({ error: 'Failed to fetch tokens' }, { status: 500 })
  }
} 