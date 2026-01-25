'use client'

import tokenLookup from '../data/token-lookup.json'

const USDC_ADDRESS = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const USDT_ADDRESS = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'

interface TokenInfo {
  symbol: string;
  name: string;
  decimals: number;
  tags: string[];
}

export class PriceService {
  private static instance: PriceService
  private priceCache: Map<string, { price: number; timestamp: number }>
  private tokenLookup: { [key: string]: TokenInfo }
  private CACHE_TTL = 60000 // 1 minute cache

  private constructor() {
    this.priceCache = new Map()
    this.tokenLookup = tokenLookup
  }

  static getInstance(): PriceService {
    if (!PriceService.instance) {
      PriceService.instance = new PriceService()
    }
    return PriceService.instance
  }

  private getTokenDecimals(address: string): number {
    return this.tokenLookup[address]?.decimals ?? 6
  }

  private async fetchPriceWithRetry(tokenAddress: string, retries = 3, baseDelay = 1000): Promise<number | null> {
    let lastError: { code?: string; message?: string } | null = null
    
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const inputDecimals = this.getTokenDecimals(tokenAddress)
        const outputDecimals = this.getTokenDecimals(USDC_ADDRESS)
        const inputAmount = Math.pow(10, inputDecimals)

        // Reduce logging noise
        if (attempt === 0) {  // Only log on first attempt
          console.log('Fetching price for token:', {
            address: tokenAddress,
            decimals: inputDecimals,
            amount: inputAmount
          })
        }

        const response = await fetch(
          `/api/price?tokenAddress=${tokenAddress}&amount=${inputAmount}`,
          {
            method: 'GET',
            headers: {
              'Accept': 'application/json'
            }
          }
        )

        // Handle rate limits
        if (response.status === 429) {
          const retryAfter = parseInt(response.headers.get('Retry-After') || '0')
          const delay = retryAfter * 1000 || baseDelay * Math.pow(2, attempt)
          console.warn(`Rate limited for ${tokenAddress}, retrying in ${delay}ms`)
          await new Promise(resolve => setTimeout(resolve, delay))
          continue
        }

        const data = await response.json()

        // Check for expected error responses (now returned as 200)
        const errorCode = data.code || data.errorCode
        if (errorCode === 'COULD_NOT_FIND_ANY_ROUTE' || 
            errorCode === 'TOKEN_NOT_TRADABLE' ||
            errorCode === 'NO_PRICE_DATA') {
          lastError = { code: errorCode, message: data.error || data.details || 'Token not tradeable' }
          
          // If Jupiter fails, try Birdeye as fallback (only on first attempt)
          if (attempt === 0) {
            console.info(`Jupiter failed for ${tokenAddress} (${errorCode}), trying Birdeye fallback...`)
            const birdeyePrice = await this.fetchPriceFromBirdeye(tokenAddress)
            if (birdeyePrice !== null) {
              console.log(`Successfully fetched price from Birdeye for ${tokenAddress}: ${birdeyePrice}`)
              return birdeyePrice
            }
          }
          
          if (attempt === 0) { // Only log on first attempt
            console.info(`Token not available: ${tokenAddress} (${errorCode}) - ${lastError.message}`)
          }
          return null
        }

        // Handle unexpected errors
        if (!response.ok) {
          lastError = { code: `HTTP_${response.status}`, message: data.error || 'API error' }
          console.warn(`Price API error for ${tokenAddress} (${response.status}):`, data)
          return null
        }

        // Check for outAmount in various possible fields
        const rawOutAmount = data.outAmount || data.outAmountWithSlippage
        if (!rawOutAmount) {
          lastError = { code: 'NO_PRICE_DATA', message: 'No quote data in response' }
          console.warn(`No quote data for ${tokenAddress}:`, data)
          
          // Try Birdeye as fallback
          if (attempt === 0) {
            const birdeyePrice = await this.fetchPriceFromBirdeye(tokenAddress)
            if (birdeyePrice !== null) {
              return birdeyePrice
            }
          }
          
          return null
        }

        // Convert string to number if needed (new API returns strings)
        const outAmount = typeof rawOutAmount === 'string' ? parseInt(rawOutAmount, 10) : rawOutAmount

        // Convert the output amount to USDC price (USDC has 6 decimals)
        const price = outAmount / Math.pow(10, outputDecimals)
        return price
      } catch (error: any) {
        lastError = { code: error.code || 'NETWORK_ERROR', message: error.message }
        console.error(`Attempt ${attempt + 1} failed for ${tokenAddress}:`, error)
        if (attempt === retries - 1) {
          // On final attempt, try Birdeye as last resort
          const birdeyePrice = await this.fetchPriceFromBirdeye(tokenAddress)
          if (birdeyePrice !== null) {
            return birdeyePrice
          }
          return null
        }
        
        // Wait before retrying
        const delay = baseDelay * Math.pow(2, attempt)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
    
    // Log final failure reason if we have one
    if (lastError) {
      console.warn(`Failed to fetch price for ${tokenAddress}: ${lastError.code} - ${lastError.message}`)
    }
    
    return null
  }

  private async fetchPriceFromBirdeye(tokenAddress: string): Promise<number | null> {
    try {
      // Try to fetch from our market data API which uses Birdeye
      const response = await fetch(`/api/tokens/market-data?addresses=${tokenAddress}`)
      if (response.ok) {
        const data = await response.json()
        const tokenData = data.tokens?.find((t: any) => t.address === tokenAddress)
        if (tokenData?.currentPrice) {
          return tokenData.currentPrice
        }
      }
    } catch (error) {
      // Silently fail - this is just a fallback
    }
    return null
  }

  async fetchPrice(tokenAddress: string): Promise<number | null> {
    try {
      // Special case for USDC and USDT
      if (tokenAddress === USDC_ADDRESS || tokenAddress === USDT_ADDRESS) {
        return 1
      }

      // Check cache
      const cached = this.priceCache.get(tokenAddress)
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        return cached.price
      }

      const price = await this.fetchPriceWithRetry(tokenAddress)
      if (price !== null) {
        this.priceCache.set(tokenAddress, { price, timestamp: Date.now() })
      }
      return price
    } catch (error) {
      console.error(`Failed to fetch price for ${tokenAddress}:`, error)
      return null
    }
  }

  async fetchPricesForAddresses(addresses: string[]): Promise<Map<string, number>> {
    const priceMap = new Map<string, number>()
    const failedTokens = new Set<string>()
    
    // Filter out USDC/USDT and add them with price 1
    const stablecoins = new Set([USDC_ADDRESS, USDT_ADDRESS])
    addresses.forEach(addr => {
      if (stablecoins.has(addr)) {
        priceMap.set(addr, 1)
      }
    })

    // Fetch prices for remaining tokens
    const tokensToFetch = addresses.filter(addr => !stablecoins.has(addr))
    
    // Add delay between requests to avoid rate limits
    const delay = 1000 // Increase to 1 second between requests
    
    for (const address of tokensToFetch) {
      try {
        console.log(`Fetching price for token: ${address}`)
        const price = await this.fetchPrice(address)
        if (price !== null && price > 0) {
          console.log(`Successfully fetched price for ${address}: ${price}`)
          priceMap.set(address, price)
        } else {
          // Price fetch returned null - token likely not tradeable or no route available
          // This is expected for some tokens, so we'll just skip it
          console.info(`Price unavailable for ${address} (token may not be tradeable or have no trading route)`)
          failedTokens.add(address)
        }
        // Wait before next request
        await new Promise(resolve => setTimeout(resolve, delay))
      } catch (error: any) {
        console.error(`Error fetching price for token ${address}:`, {
          message: error.message,
          code: error.code,
          stack: error.stack
        })
        failedTokens.add(address)
      }
    }

    if (failedTokens.size > 0) {
      console.warn(`Failed to fetch prices for ${failedTokens.size} token(s):`, Array.from(failedTokens))
      console.info('This is normal for tokens that are not tradeable or have no trading routes on Jupiter')
    }

    return priceMap
  }
} 