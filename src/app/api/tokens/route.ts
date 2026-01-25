import { NextResponse } from 'next/server'
import tokenLookupData from '@/lib/data/token-lookup.json'

interface JupiterToken {
  address: string
  symbol: string
  name: string
  decimals: number
  tags?: string[]
  logoURI?: string
}

interface JupiterTokenV2 {
  address: string
  symbol: string
  name: string
  decimals: number
  logoURI?: string
  tags?: string[]
  // Additional fields from V2 API
  organicScore?: number
  holderCount?: number
  marketCap?: number
  liquidity?: number
}

export async function GET() {
  // Strategy: Try multiple Jupiter endpoints to get trending/cooking tokens
  // 1. Try V2 Recent endpoint (tokens with recent first pool)
  // 2. Try V2 Content endpoint (might have trending tokens)
  // 3. Fallback to V1 verified tokens
  // 4. Fallback to local data

  const headers = {
    'User-Agent': 'Mozilla/5.0',
    'Accept': 'application/json',
    'Referer': 'https://jup.ag',
    'Origin': 'https://jup.ag'
  }

  // Try 1: V2 Recent endpoint (trending/new tokens)
  try {
    const recentResponse = await fetch('https://api.jup.ag/tokens/v2/recent', { headers })
    
    if (recentResponse.ok) {
      const recentData = await recentResponse.json() as { mints: string[] }
      
      if (recentData.mints && recentData.mints.length > 0) {
        // Fetch full token details for recent mints
        const mintsToFetch = recentData.mints.slice(0, 50).join(',')
        const searchResponse = await fetch(`https://api.jup.ag/tokens/v2/search?query=${mintsToFetch}`, { headers })
        
        if (searchResponse.ok) {
          const tokensData = await searchResponse.json() as { tokens: JupiterTokenV2[] }
          
          if (tokensData.tokens && tokensData.tokens.length > 0) {
            const tokens: JupiterToken[] = tokensData.tokens.map(token => ({
              address: token.address,
              symbol: token.symbol,
              name: token.name,
              decimals: token.decimals,
              tags: token.tags || [],
              logoURI: token.logoURI
            }))
            
            return NextResponse.json({
              count: tokens.length,
              tokens: tokens,
              source: 'jupiter-v2-recent'
            })
          }
        }
      }
    }
  } catch (v2RecentError) {
    console.log('V2 Recent endpoint failed, trying alternatives...', v2RecentError)
  }

  // Try 2: V1 verified tokens endpoint (more reliable, but not specifically trending)
  try {
    const response = await fetch('https://tokens.jup.ag/tokens?tags=verified', { headers })

    if (response.ok) {
      const tokens = await response.json() as JupiterToken[]
      
      if (tokens && tokens.length > 0) {
        // Return top 50 verified tokens
        return NextResponse.json({
          count: tokens.length,
          tokens: tokens.slice(0, 50),
          source: 'jupiter-v1-verified'
        })
      }
    }
  } catch (v1Error) {
    console.log('V1 endpoint failed, using fallback...', v1Error)
  }
  
  // Fallback: Use local token lookup data
  try {
    const localTokens: JupiterToken[] = Object.entries(tokenLookupData).map(([address, tokenData]: [string, any]) => ({
      address,
      symbol: tokenData.symbol,
      name: tokenData.name,
      decimals: tokenData.decimals,
      tags: tokenData.tags || [],
      logoURI: undefined
    }))
    
    console.log(`Using fallback: ${localTokens.length} tokens from local data`)
    
    return NextResponse.json({
      count: localTokens.length,
      tokens: localTokens.slice(0, 50),
      source: 'fallback-local'
    })
  } catch (fallbackError) {
    console.error('All fallbacks failed:', fallbackError)
    return NextResponse.json({ 
      error: 'Failed to fetch tokens',
      details: 'All endpoints failed'
    }, { status: 500 })
  }
}
