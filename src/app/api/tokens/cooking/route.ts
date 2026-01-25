import { NextResponse } from 'next/server'
import { getTokenByMint } from '@/lib/types'
import tokenLookupData from '@/lib/data/token-lookup.json'

// Only load .env file in development - completely skipped in production
// In production (Vercel), environment variables are injected automatically via process.env
if (process.env.NODE_ENV === 'development') {
  try {
    const fs = require('fs')
    const path = require('path')
    const envPath = path.join(process.cwd(), '.env')
    
    if (fs.existsSync(envPath)) {
      const envFile = fs.readFileSync(envPath, 'utf8')
      const lines = envFile.split(/\r?\n/)
      
      for (const line of lines) {
        const trimmedLine = line.trim()
        if (trimmedLine.startsWith('#') || !trimmedLine) continue
        
        let match = trimmedLine.match(/^([^=:#]+)=(.*)$/)
        if (!match) {
          match = trimmedLine.match(/^([^=:#\s]+)\s*=\s*(.*)$/)
        }
        
        if (match) {
          const key = match[1].trim()
          let value = match[2].trim()
          value = value.replace(/^["']|["']$/g, '')
          
          if (key === 'BIRDEYE_API_KEY' && !process.env.BIRDEYE_API_KEY) {
            process.env.BIRDEYE_API_KEY = value
            break
          }
        }
      }
    }
  } catch (error) {
    // Silently fail - not critical
  }
}

// Simple in-memory cache
let cachedResult: { tokens: any[], timestamp: number } | null = null
const CACHE_TTL = 10 * 60 * 1000 // 10 minutes cache to respect Birdeye rate limit (60 rpm)
const BACKGROUND_REFRESH_THRESHOLD = 8 * 60 * 1000 // Refresh in background if cache is older than 8 minutes

// Background refresh promise to prevent multiple simultaneous refreshes
let backgroundRefreshPromise: Promise<void> | null = null

// Rate limiting: Birdeye API has 60 requests per minute limit
// We cache for 10 minutes to ensure we stay well under the limit
// Background refresh happens at 8 minutes to keep data fresh

export async function GET(request: Request) {
  // Allow cache bypass for testing with ?bypassCache=true
  const { searchParams } = new URL(request.url)
  const bypassCache = searchParams.get('bypassCache') === 'true'
  
  // Check cache first - this helps us stay under the 60 rpm rate limit
  const cacheAge = cachedResult ? Date.now() - cachedResult.timestamp : Infinity
  
  if (!bypassCache && cachedResult && cacheAge < CACHE_TTL) {
    const ageSeconds = Math.round(cacheAge / 1000)
    console.log('Returning cached cooking tokens (age:', ageSeconds, 'seconds)')
    
    // If cache is getting stale (> 8 minutes), log a warning
    // The cache will refresh on the next request after TTL expires
    if (cacheAge > BACKGROUND_REFRESH_THRESHOLD) {
      console.log('⚠️ Cache is getting stale (', Math.round(cacheAge / 60000), 'minutes old). Next request will refresh.')
    }
    
    return NextResponse.json({
      count: cachedResult.tokens.length,
      tokens: cachedResult.tokens,
      source: 'cached',
      cached: true,
      cacheAgeSeconds: ageSeconds,
      note: 'Cached to respect Birdeye 60 rpm rate limit'
    })
  }

  console.log('Fetching fresh cooking tokens from Birdeye API...', bypassCache ? '(cache bypassed)' : '')
  console.log('Environment check:', {
    hasBirdeyeKey: !!process.env.BIRDEYE_API_KEY,
    birdeyeKeyLength: process.env.BIRDEYE_API_KEY?.length || 0,
    birdeyeKeyPrefix: process.env.BIRDEYE_API_KEY?.substring(0, 4) || 'none',
    nodeEnv: process.env.NODE_ENV,
    allEnvKeys: Object.keys(process.env).filter(k => k.includes('BIRDEYE') || k.includes('API'))
  })

  try {
    // Use Birdeye API to get trending tokens based on actual swap volume
    // Birdeye tracks Jupiter swaps and provides 24h volume data
    // Rate limit: 60 requests per minute
    const birdeyeApiKey = process.env.BIRDEYE_API_KEY
    
    if (!birdeyeApiKey) {
      console.warn('BIRDEYE_API_KEY not set in process.env')
      console.warn('Available env vars:', Object.keys(process.env).filter(k => k.includes('BIRDEYE') || k.includes('API')))
      throw new Error('Birdeye API key not configured - please restart dev server after adding BIRDEYE_API_KEY to .env')
    }
    
    console.log('Calling Birdeye API with key:', birdeyeApiKey.substring(0, 8) + '...')
    
    // Get trending tokens from Birdeye - sorted by volume/trending metrics
    // Birdeye API limit: 1-20 (we'll request 20 and filter for positive price change)
    const birdeyeResponse = await fetch(
      'https://public-api.birdeye.so/defi/token_trending?sort_by=volume24hUSD&sort_type=desc&limit=20',
      {
        headers: {
          'X-API-KEY': birdeyeApiKey,
          'Accept': 'application/json'
        }
      }
    )

    console.log('Birdeye API response status:', birdeyeResponse.status)

    if (!birdeyeResponse.ok) {
      const errorText = await birdeyeResponse.text()
      console.error('Birdeye API error:', birdeyeResponse.status, errorText)
      
      // If rate limited, return cached result even if expired
      if (birdeyeResponse.status === 429) {
        if (cachedResult) {
          console.warn('Rate limited, returning stale cache')
          return NextResponse.json({
            count: cachedResult.tokens.length,
            tokens: cachedResult.tokens,
            source: 'stale-cache',
            cached: true,
            warning: 'Rate limited - returning cached data'
          })
        }
        // No cache available, throw error with helpful message
        throw new Error(`Birdeye API rate limited (429). Please wait before retrying. Rate limit: 60 requests per minute.`)
      }
      
      throw new Error(`Birdeye API returned ${birdeyeResponse.status}`)
    }

    const birdeyeData = await birdeyeResponse.json()
    
    console.log('🔍 Birdeye API FULL response:', JSON.stringify(birdeyeData, null, 2).substring(0, 2000))
    console.log('🔍 Birdeye API response structure:', {
      hasData: !!birdeyeData.data,
      hasTokens: !!birdeyeData.tokens,
      keys: Object.keys(birdeyeData),
      firstItem: birdeyeData.data?.tokens?.[0] || birdeyeData.tokens?.[0] || birdeyeData[0]
    })
    
    // Birdeye returns tokens with volume and price change data
    // Check multiple possible response formats
    let trendingTokens: any[] = []
    if (birdeyeData.data?.tokens) {
      trendingTokens = birdeyeData.data.tokens
    } else if (birdeyeData.tokens) {
      trendingTokens = birdeyeData.tokens
    } else if (Array.isArray(birdeyeData)) {
      trendingTokens = birdeyeData
    } else if (birdeyeData.data && Array.isArray(birdeyeData.data)) {
      trendingTokens = birdeyeData.data
    }
    
    console.log(`📊 Found ${trendingTokens.length} trending tokens from Birdeye`)
    console.log('📊 First token sample:', trendingTokens[0] ? JSON.stringify(trendingTokens[0], null, 2) : 'none')
    
    if (trendingTokens.length === 0) {
      console.warn('❌ No tokens returned from Birdeye, using fallback')
      throw new Error('No tokens returned from Birdeye API')
    }
    
    // Log first token to see all available fields
    if (trendingTokens.length > 0) {
      console.log('🔍 First token ALL fields:', Object.keys(trendingTokens[0]))
      console.log('🔍 First token sample values:', {
        symbol: trendingTokens[0].symbol,
        address: trendingTokens[0].address || trendingTokens[0].mint,
        priceChange24h: trendingTokens[0].priceChange24h,
        price_change_24h: trendingTokens[0].price_change_24h,
        priceChange24hPercent: trendingTokens[0].priceChange24hPercent,
        price_change_24h_percent: trendingTokens[0].price_change_24h_percent,
        price24hChange: trendingTokens[0].price24hChange,
        price_24h_change: trendingTokens[0].price_24h_change,
        priceChange: trendingTokens[0].priceChange,
        price_change: trendingTokens[0].price_change,
        volume24hUSD: trendingTokens[0].volume24hUSD,
        volume_24h_usd: trendingTokens[0].volume_24h_usd,
        volume24h: trendingTokens[0].volume24h,
        volume_24h: trendingTokens[0].volume_24h,
        volume: trendingTokens[0].volume
      })
    }
    
    // Filter for tokens with positive 24h price change
    // Check all possible field names for price change
    const tokensWithData = trendingTokens
      .map((token: any) => {
        // Try all possible field names for price change
        const priceChange = token.priceChange24h || 
                           token.price_change_24h || 
                           token.priceChange24hPercent ||
                           token.price_change_24h_percent ||
                           token.priceChange || 
                           token.price_change ||
                           token.price24hChange ||
                           token.price_24h_change ||
                           token.priceChangePercent ||
                           token.price_change_percent ||
                           0
        
        const volume = token.volume24hUSD || 
                      token.volume_24h_usd || 
                      token.volume24h || 
                      token.volume_24h ||
                      token.volume || 0
        
        return { token, priceChange, volume }
      })
    
    console.log(`📊 Tokens with data: ${tokensWithData.length}`)
    console.log(`📊 Price changes found:`, tokensWithData.slice(0, 5).map(t => t.priceChange))
    
    // Get top 20 tokens by volume first (before filtering by price change)
    const topTokensByVolume = tokensWithData
      .filter(({ volume }) => volume > 0)
      .sort((a: any, b: any) => b.volume - a.volume)
      .slice(0, 20)
      .map(({ token }) => token)
    
    console.log(`📊 Top 20 tokens by volume selected, fetching price stats...`)
    
    // Fetch 24h price change data from Birdeye Price Stats API
    // Use batch endpoint to get price stats for all tokens at once
    const tokenAddresses = topTokensByVolume
      .map(t => t.address || t.mint)
      .filter((addr): addr is string => !!addr)
    
    let priceStatsMap: Record<string, any> = {}
    
    if (tokenAddresses.length > 0 && birdeyeApiKey) {
      try {
        console.log(`📊 Fetching current and historical prices for ${tokenAddresses.length} tokens...`)
        console.log(`📊 Rate limiting: Birdeye allows 60 rpm, spacing requests by ~1 second`)
        
        // Throttle function: Birdeye allows 60 rpm = 1 request per second
        // We'll space requests by 1.1 seconds to be safe
        const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
        
        // Fetch current prices sequentially with throttling to avoid rate limits
        // The current price endpoint already includes priceChange24h, so we don't need historical endpoint!
        const tokensToFetch = tokenAddresses.slice(0, 20) // Can fetch more since we're only making 1 call per token
        console.log(`📊 Fetching price data (with 24h change) for ${tokensToFetch.length} tokens`)
        
        const priceResults = []
        for (let i = 0; i < tokensToFetch.length; i++) {
          const address = tokensToFetch[i]
          
          // Add delay between requests (except first one)
          if (i > 0) {
            await delay(1100) // 1.1 seconds between requests
          }
          
          try {
            // Fetch current price (which includes priceChange24h!)
            const currentPriceResponse = await fetch(
              `https://public-api.birdeye.so/defi/price?address=${address}`,
              {
                headers: {
                  'X-API-KEY': birdeyeApiKey,
                  'Accept': 'application/json'
                }
              }
            )
            
            // Check for rate limit
            if (currentPriceResponse.status === 429) {
              console.warn(`⚠️ Rate limited on price fetch for ${address}, stopping`)
              break // Stop fetching, use what we have
            }
            
            let currentPrice: number | null = null
            let priceChange24h: number | null = null
            
            if (currentPriceResponse.ok) {
              const currentData = await currentPriceResponse.json()
              // Birdeye price endpoint returns { data: { value: number, priceChange24h: number } }
              currentPrice = currentData?.data?.value || currentData?.value || currentData?.price || currentData?.data?.price || null
              priceChange24h = currentData?.data?.priceChange24h ?? null
              
              if (priceChange24h !== null) {
                console.log(`✅ Got price data for ${address}: price=${currentPrice}, change24h=${priceChange24h}%`)
              }
            } else {
              const errorText = await currentPriceResponse.text().catch(() => '')
              console.warn(`⚠️ Price response not OK for ${address}:`, currentPriceResponse.status, errorText.substring(0, 100))
            }
            
            priceResults.push({
              address,
              currentPrice,
              priceChange24h
            })
          } catch (error) {
            console.warn(`⚠️ Failed to fetch price for ${address}:`, error)
            priceResults.push({ address, currentPrice: null, priceChange24h: null })
          }
        }
        
        // Build price stats map
        priceResults.forEach((result) => {
          if (result.address) {
            priceStatsMap[result.address] = {
              priceChange24h: result.priceChange24h,
              currentPrice: result.currentPrice
            }
          }
        })
        
        console.log(`📊 Price data fetched for ${Object.keys(priceStatsMap).length} tokens`)
        const tokensWithPriceData = priceResults.filter(r => r.priceChange24h !== null)
        console.log(`📊 Tokens with valid price change: ${tokensWithPriceData.length}`)
        if (tokensWithPriceData.length > 0) {
          const sample = tokensWithPriceData[0]
          console.log(`📊 Sample price data:`, {
            address: sample.address,
            currentPrice: sample.currentPrice,
            priceChange24h: sample.priceChange24h
          })
        } else {
          console.warn(`⚠️ No tokens have valid price change data!`)
        }
      } catch (error) {
        console.warn(`⚠️ Failed to fetch price data:`, error)
        // Continue without price stats - we'll use volume only
      }
    }
    
    // Merge price stats with trending tokens
    const tokensWithPriceData = topTokensByVolume.map(token => {
      const address = token.address || token.mint
      const stats = address ? priceStatsMap[address] : null
      
      // Get price change from stats first, then fallback to token data
      // Birdeye trending endpoint uses price24hChangePercent field
      const priceChangeFromStats = stats?.priceChange24h
      const priceChangeFromToken = token.price24hChangePercent || 
                                  token.priceChange24h || 
                                  token.price_change_24h || 
                                  token.priceChange24hPercent ||
                                  token.price_change_24h_percent ||
                                  null
      
      // Use stats if available, otherwise use token data, but don't default to 0
      // (0 would pass the filter incorrectly)
      const priceChange = priceChangeFromStats !== null && priceChangeFromStats !== undefined
        ? priceChangeFromStats
        : priceChangeFromToken
      
      return {
        token,
        priceChange: priceChange ?? 0, // Only default to 0 if truly missing
        volume: token.volume24hUSD || 
                token.volume_24h_usd || 
                token.volume24h || 
                token.volume_24h ||
                token.volume || 0,
        currentPrice: stats?.currentPrice ?? 
                     (token.price || 
                     token.price_usd || 
                     null)
      }
    })
    
    // Filter for positive price change
    console.log(`📊 Filtering ${tokensWithPriceData.length} tokens for positive price change...`)
    tokensWithPriceData.forEach(({ token, priceChange, volume }) => {
      const address = token.address || token.mint
      console.log(`📊 Token ${token.symbol || address}: priceChange=${priceChange}, volume=${volume}`)
    })
    
    const tokensWithPositiveChange = tokensWithPriceData
      .filter(({ priceChange, volume }) => {
        const hasVolume = volume > 0
        // Strictly require priceChange > 0 (not null, not undefined, not 0, not negative)
        const hasPositiveChange = typeof priceChange === 'number' && priceChange > 0
        
        if (!hasPositiveChange) {
          console.log(`❌ Token filtered out: priceChange=${priceChange} (type: ${typeof priceChange}), volume=${volume}`)
        } else {
          console.log(`✅ Token passed filter: priceChange=${priceChange}, volume=${volume}`)
        }
        
        return hasPositiveChange && hasVolume
      })
      .sort((a: any, b: any) => {
        // Sort by 24h volume (most purchased)
        return b.volume - a.volume
      })
      .map(({ token }) => token) // Extract just the token objects
    
    console.log(`✅ Filtered to ${tokensWithPositiveChange.length} tokens with positive price change`)
    if (tokensWithPositiveChange.length > 0) {
      console.log('✅ Top 5 tokens:', tokensWithPositiveChange.slice(0, 5).map((t: any) => ({
        symbol: t.symbol || 'NO_SYMBOL',
        address: t.address || t.mint || 'NO_ADDRESS',
        name: t.name || 'NO_NAME'
      })))
    } else {
      console.warn('⚠️ No tokens passed the positive price change filter!')
      console.warn('⚠️ Using all tokens sorted by volume instead (relaxing price change requirement)')
      // Fallback: if no tokens have positive price change, just use top by volume
      const fallbackTokens = tokensWithPriceData
        .filter(({ volume }) => volume > 0)
        .sort((a: any, b: any) => b.volume - a.volume)
        .slice(0, 20)
      
      const fallbackTokensWithMetadata = await Promise.all(
        fallbackTokens.map(async ({ token, priceChange, currentPrice }) => {
          try {
            const address = token.address || token.mint
            if (!address) return null
            const tokenInfo = await getTokenByMint(address, true)
            return {
              address: address,
              symbol: token.symbol || tokenInfo?.symbol || 'UNKNOWN',
              name: token.name || tokenInfo?.name || 'Unknown Token',
              decimals: token.decimals || tokenInfo?.decimals || 9,
              tags: tokenInfo?.tags || [],
              logoURI: token.logoURI || token.logo || undefined,
              // Price data
              currentPrice: currentPrice || token.price || token.price_usd || null,
              priceChange24h: priceChange || 
                            (token.priceChange24h || 
                            token.price24hChangePercent ||
                            0),
              // Market data from Birdeye trending response
              volume24hUSD: token.volume24hUSD || token.volume_24h_usd || 0,
              marketCap: token.marketcap || token.marketCap || null,
              fdv: token.fdv || token.fullyDilutedValuation || null,
              liquidity: token.liquidity || null
            }
          } catch (error) {
            return null
          }
        })
      )
      
      const validFallbackTokens = fallbackTokensWithMetadata.filter(t => t !== null)
      
      return NextResponse.json({
        count: validFallbackTokens.length,
        tokens: validFallbackTokens,
        source: 'birdeye-trending-fallback',
        criteria: 'Most purchased tokens (24h volume) - no positive price change filter applied',
        note: 'No tokens had positive 24h price change, showing top by volume instead'
      })
    }
    
    // Fetch full token metadata and format
    // Note: We're using getTokenByMint which may make additional API calls
    // but those are to Jupiter's token API, not Birdeye, so they don't count toward Birdeye rate limit
    const tokensWithMetadata = await Promise.all(
      tokensWithPositiveChange.map(async (token: any) => {
        try {
          const address = token.address || token.mint
          if (!address) return null
          
          const tokenInfo = await getTokenByMint(address, true)
          const stats = priceStatsMap[address]
          
          console.log(`📊 Formatting token ${token.symbol || address}:`, {
            address,
            hasStats: !!stats,
            statsPriceChange: stats?.priceChange24h,
            statsCurrentPrice: stats?.currentPrice
          })
          
          // Use price stats data if available, otherwise fallback to token data
          // Include additional market data from Birdeye trending response
          return {
            address: address,
            symbol: token.symbol || tokenInfo?.symbol || 'UNKNOWN',
            name: token.name || tokenInfo?.name || 'Unknown Token',
            decimals: token.decimals || tokenInfo?.decimals || 9,
            tags: tokenInfo?.tags || [],
            logoURI: token.logoURI || token.logo || undefined,
            // Price data
            currentPrice: stats?.currentPrice ?? 
                        (token.price || 
                        token.price_usd || 
                        null),
            priceChange24h: stats?.priceChange24h ?? 
                          (token.priceChange24h || 
                          token.price_change_24h || 
                          token.price24hChangePercent ||
                          token.price_24h_change_percent ||
                          0),
            // Market data from Birdeye trending response
            volume24hUSD: token.volume24hUSD || token.volume_24h_usd || 0,
            marketCap: token.marketcap || token.marketCap || null,
            fdv: token.fdv || token.fullyDilutedValuation || null,
            liquidity: token.liquidity || null
          }
        } catch (error) {
          console.warn(`Failed to process token:`, error)
          return null
        }
      })
    )
    
    const validTokens = tokensWithMetadata.filter(t => t !== null)
    
    // Cache the result for 10 minutes to respect rate limit
    cachedResult = {
      tokens: validTokens,
      timestamp: Date.now()
    }
    
    return NextResponse.json({
      count: validTokens.length,
      tokens: validTokens,
      source: 'birdeye-trending',
      criteria: 'Most purchased tokens (24h volume) with positive price change',
      rateLimitNote: 'Birdeye API: 60 rpm limit, cached for 10 minutes',
      debug: {
        birdeyeTokensReceived: trendingTokens.length,
        tokensWithPositiveChange: tokensWithPositiveChange.length,
        cacheBypassed: bypassCache
      }
    })
  } catch (error) {
    console.error('Failed to fetch cooking tokens from Birdeye:', error)
    
    // Fallback: Use local token lookup data (same as /api/tokens fallback)
    console.log('Using local token lookup as fallback...')
    try {
      const localTokens = Object.entries(tokenLookupData).slice(0, 50).map(([address, tokenData]: [string, any]) => ({
        address,
        symbol: tokenData.symbol,
        name: tokenData.name,
        decimals: tokenData.decimals,
        tags: tokenData.tags || [],
        logoURI: undefined
      }))
      
      return NextResponse.json({
        count: localTokens.length,
        tokens: localTokens,
        source: 'fallback-local',
        note: 'Birdeye API not available, using local token data. Please restart dev server after adding BIRDEYE_API_KEY to .env',
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    } catch (fallbackError) {
      console.error('Fallback also failed:', fallbackError)
    }
    
    return NextResponse.json({ 
      error: 'Failed to fetch cooking tokens',
      details: error instanceof Error ? error.message : 'Unknown error',
      suggestion: 'Add BIRDEYE_API_KEY to .env file and restart the dev server'
    }, { status: 500 })
  }
}
