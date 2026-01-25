import { NextResponse } from 'next/server'

interface JupiterTokenV2 {
  address: string
  symbol: string
  name: string
  decimals: number
  logoURI?: string
  tags?: string[]
  organicScore?: number
  holderCount?: number
  marketCap?: number
  liquidity?: number
}

interface JupiterToken {
  address: string
  symbol: string
  name: string
  decimals: number
  tags?: string[]
  logoURI?: string
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q')
  
  if (!query || query.trim().length === 0) {
    return NextResponse.json({ 
      error: 'Query parameter "q" is required' 
    }, { status: 400 })
  }

  const trimmedQuery = query.trim()
  
  // Require minimum 2 characters for name searches
  if (trimmedQuery.length < 2) {
    return NextResponse.json({
      count: 0,
      tokens: [],
      query: trimmedQuery,
      error: 'Query must be at least 2 characters'
    })
  }

  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0',
    'Accept': 'application/json',
    'Referer': 'https://jup.ag',
    'Origin': 'https://jup.ag'
  }

  // Get Jupiter API key from environment
  const jupiterApiKey = process.env.NEXT_PUBLIC_JUPITER_API_KEY || process.env.JUPITER_API_KEY
  
  if (jupiterApiKey) {
    headers['x-api-key'] = jupiterApiKey
    console.log('Using Jupiter API key:', jupiterApiKey.substring(0, 8) + '...')
  } else {
    console.warn('⚠️ Jupiter API key not found. Search may fail. Add NEXT_PUBLIC_JUPITER_API_KEY to .env')
  }

  try {
    // Use Jupiter V2 search endpoint - it supports searching by name, symbol, or address
    // Note: The API may require a minimum query length or have rate limits
    const searchUrl = `https://api.jup.ag/tokens/v2/search?query=${encodeURIComponent(trimmedQuery)}`
    console.log('Searching Jupiter API:', searchUrl)
    
    const searchResponse = await fetch(searchUrl, { 
      headers,
      // Add cache control
      cache: 'no-store'
    })
    
    console.log('Search response status:', searchResponse.status, searchResponse.statusText)
    
    if (!searchResponse.ok) {
      const errorText = await searchResponse.text()
      console.error('Jupiter API error response:', {
        status: searchResponse.status,
        statusText: searchResponse.statusText,
        body: errorText
      })
      
      // Return empty results instead of error for 404/400 (no results found)
      if (searchResponse.status === 404 || searchResponse.status === 400) {
        return NextResponse.json({
          count: 0,
          tokens: [],
          query: trimmedQuery
        })
      }
      
      return NextResponse.json({
        count: 0,
        tokens: [],
        query: trimmedQuery,
        error: `Jupiter API returned ${searchResponse.status}: ${errorText}`
      })
    }
    
    const responseData = await searchResponse.json()
    console.log('Jupiter API response structure:', {
      isArray: Array.isArray(responseData),
      hasTokens: !!responseData.tokens,
      tokenCount: responseData.tokens?.length || (Array.isArray(responseData) ? responseData.length : 0),
      responseKeys: Object.keys(responseData),
      sampleData: JSON.stringify(responseData).substring(0, 200)
    })
    
    // Handle different response formats
    let tokensArray: JupiterTokenV2[] = []
    
    if (responseData.tokens && Array.isArray(responseData.tokens)) {
      tokensArray = responseData.tokens
    } else if (Array.isArray(responseData)) {
      tokensArray = responseData
    } else if (responseData.data && Array.isArray(responseData.data)) {
      tokensArray = responseData.data
    }
    
    if (tokensArray.length > 0) {
      // Log first token structure to see what fields Jupiter returns
      console.log('First token from Jupiter:', {
        raw: tokensArray[0],
        hasAddress: !!tokensArray[0].address,
        hasMint: !!(tokensArray[0] as any).mint,
        hasId: !!(tokensArray[0] as any).id,
        keys: Object.keys(tokensArray[0])
      })
      
      // Limit to top 20 results for performance
      const tokens: JupiterToken[] = tokensArray.slice(0, 20).map(token => {
        // Jupiter API uses 'id' as the mint address field!
        const address = token.address || (token as any).mint || (token as any).mintAddress || (token as any).id
        return {
          address: address,
          symbol: token.symbol,
          name: token.name,
          decimals: token.decimals,
          tags: token.tags || [],
          logoURI: token.logoURI || (token as any).icon
        }
      }).filter(token => token.address) // Filter out tokens without address
      
      console.log('Returning tokens:', {
        total: tokens.length,
        sample: tokens[0],
        allHaveAddress: tokens.every(t => t.address)
      })
      
      return NextResponse.json({
        count: tokens.length,
        tokens: tokens,
        query: trimmedQuery
      })
    }
    
    // If no results, return empty array
    console.log('No tokens found for query:', trimmedQuery)
    return NextResponse.json({
      count: 0,
      tokens: [],
      query: trimmedQuery
    })
  } catch (error) {
    console.error('Error searching tokens:', error)
    return NextResponse.json({ 
      error: 'Failed to search tokens',
      details: error instanceof Error ? error.message : 'Unknown error',
      tokens: [],
      count: 0,
      query: trimmedQuery
    }, { status: 500 })
  }
}
