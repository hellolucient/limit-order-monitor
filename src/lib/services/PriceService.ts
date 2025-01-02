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
        if (data.code === 'COULD_NOT_FIND_ANY_ROUTE' || data.code === 'TOKEN_NOT_TRADABLE') {
          if (attempt === 0) { // Only log on first attempt
            console.info(`Token not available: ${tokenAddress} (${data.code})`)
          }
          return null
        }

        // Handle unexpected errors
        if (!response.ok) {
          console.warn(`Price API error for ${tokenAddress} (${response.status}):`, data)
          return null
        }

        if (!data.outAmount) {
          console.warn(`No quote data for ${tokenAddress}`)
          return null
        }

        // Convert the output amount to USDC price (USDC has 6 decimals)
        const price = data.outAmount / Math.pow(10, outputDecimals)
        return price
      } catch (error) {
        console.error(`Attempt ${attempt + 1} failed for ${tokenAddress}:`, error)
        if (attempt === retries - 1) return null
        
        // Wait before retrying
        const delay = baseDelay * Math.pow(2, attempt)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
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
        const price = await this.fetchPrice(address)
        if (price !== null) {
          priceMap.set(address, price)
        } else {
          failedTokens.add(address)
        }
        // Wait before next request
        await new Promise(resolve => setTimeout(resolve, delay))
      } catch (error) {
        console.warn(`Skipping price fetch for token ${address} due to error:`, error)
        failedTokens.add(address)
      }
    }

    if (failedTokens.size > 0) {
      console.warn('Failed to fetch prices for tokens:', Array.from(failedTokens))
    }

    return priceMap
  }
} 