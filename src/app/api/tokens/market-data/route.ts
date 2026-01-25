import { NextResponse } from 'next/server'
import { getTokenByMint } from '@/lib/types'

const BIRDEYE_API_KEY = process.env.BIRDEYE_API_KEY || process.env.NEXT_PUBLIC_BIRDEYE_API_KEY

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const addresses = searchParams.get('addresses')
  
  if (!addresses) {
    return NextResponse.json(
      { error: 'Missing addresses parameter' },
      { status: 400 }
    )
  }

  const addressArray = addresses.split(',').filter(Boolean)
  
  if (addressArray.length === 0) {
    return NextResponse.json(
      { error: 'No valid addresses provided' },
      { status: 400 }
    )
  }

  if (!BIRDEYE_API_KEY) {
    return NextResponse.json(
      { error: 'Birdeye API key not configured' },
      { status: 500 }
    )
  }

  try {
    // Fetch market data from Birdeye for each token
    const marketDataPromises = addressArray.map(async (address) => {
      try {
        // Fetch price data
        const priceResponse = await fetch(
          `https://public-api.birdeye.so/defi/price?address=${address}`,
          {
            headers: {
              'X-API-KEY': BIRDEYE_API_KEY,
              'Accept': 'application/json'
            }
          }
        )

        let currentPrice: number | null = null
        let priceChange24h: number | null = null
        let volume24hUSD: number | null = null
        let marketCap: number | null = null
        let liquidity: number | null = null

        if (priceResponse.ok) {
          const priceData = await priceResponse.json()
          currentPrice = priceData?.data?.value || priceData?.value || null
          priceChange24h = priceData?.data?.priceChange24h ?? null
        }

        // Try to fetch additional market data from Birdeye's token overview endpoint
        try {
          const overviewResponse = await fetch(
            `https://public-api.birdeye.so/defi/token_overview?address=${address}`,
            {
              headers: {
                'X-API-KEY': BIRDEYE_API_KEY,
                'Accept': 'application/json'
              }
            }
          )

          if (overviewResponse.ok) {
            const overviewData = await overviewResponse.json()
            volume24hUSD = overviewData?.data?.volume24hUSD || overviewData?.data?.volume24h || null
            marketCap = overviewData?.data?.marketCap || overviewData?.data?.mc || null
            liquidity = overviewData?.data?.liquidity || null
          }
        } catch (overviewError) {
          // Silently fail - we'll just use price data
          console.warn(`Failed to fetch overview for ${address}:`, overviewError)
        }

        // Get token metadata
        const tokenInfo = await getTokenByMint(address, true)

        return {
          address,
          symbol: tokenInfo?.symbol || 'UNKNOWN',
          name: tokenInfo?.name || 'Unknown Token',
          decimals: tokenInfo?.decimals || 9,
          tags: tokenInfo?.tags || [],
          logoURI: tokenInfo?.logoURI,
          currentPrice,
          priceChange24h,
          volume24hUSD,
          marketCap,
          liquidity
        }
      } catch (error) {
        console.error(`Error fetching market data for ${address}:`, error)
        // Return basic token info even if market data fails
        const tokenInfo = await getTokenByMint(address, true)
        return {
          address,
          symbol: tokenInfo?.symbol || 'UNKNOWN',
          name: tokenInfo?.name || 'Unknown Token',
          decimals: tokenInfo?.decimals || 9,
          tags: tokenInfo?.tags || [],
          logoURI: tokenInfo?.logoURI,
          currentPrice: null,
          priceChange24h: null,
          volume24hUSD: null,
          marketCap: null,
          liquidity: null
        }
      }
    })

    const results = await Promise.all(marketDataPromises)

    return NextResponse.json({
      tokens: results
    })
  } catch (error: any) {
    console.error('Error fetching market data:', error)
    return NextResponse.json(
      { error: 'Failed to fetch market data', details: error.message },
      { status: 500 }
    )
  }
}
