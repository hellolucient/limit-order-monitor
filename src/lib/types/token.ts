import tokenLookupData from '../data/token-lookup.json'

export interface TokenInfo {
  symbol: string
  name: string
  decimals: number
  mint_authority?: string
  tags: string[]
  address: string
  logoURI?: string
}

export interface TokenLookup {
  [address: string]: Omit<TokenInfo, 'address'>
}

interface JupiterTokenResponse {
  address: string
  symbol: string
  name: string
  decimals: number
  logoURI?: string
  tags?: string[]
  mint_authority?: string | null
}

// Cache for fetched tokens to avoid repeated API calls
const tokenCache = new Map<string, TokenInfo | null>()

// Rate limiting: track pending requests and add delays
const pendingRequests = new Map<string, Promise<TokenInfo | null>>()
const requestQueue: Array<{ mintAddress: string; resolve: (value: TokenInfo | null) => void; reject: (error: any) => void }> = []
let isProcessingQueue = false
const REQUEST_DELAY = 100 // 100ms between requests to avoid rate limiting

async function processRequestQueue() {
  if (isProcessingQueue || requestQueue.length === 0) return
  
  isProcessingQueue = true
  
  while (requestQueue.length > 0) {
    const request = requestQueue.shift()!
    
    try {
      const result = await fetchTokenMetadataWithRetry(request.mintAddress)
      request.resolve(result)
    } catch (error) {
      request.reject(error)
    }
    
    // Delay between requests to avoid rate limiting
    if (requestQueue.length > 0) {
      await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY))
    }
  }
  
  isProcessingQueue = false
}

// Fetch with retry logic and rate limiting
async function fetchTokenMetadataWithRetry(mintAddress: string, retries = 3): Promise<TokenInfo | null> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(`/api/token-metadata?mintAddress=${encodeURIComponent(mintAddress)}`)
      
      if (response.status === 429) {
        // Rate limited - wait and retry
        const retryAfter = parseInt(response.headers.get('Retry-After') || '1') * 1000
        const delay = Math.min(retryAfter, 2000 * (attempt + 1)) // Max 2s per attempt
        await new Promise(resolve => setTimeout(resolve, delay))
        continue // Retry
      }
      
      if (response.status === 404) {
        // Token not found - cache null
        tokenCache.set(mintAddress, null)
        return null
      }
      
      if (!response.ok) {
        // Other error - don't retry immediately, but don't cache
        if (attempt === retries - 1) {
          return null
        }
        await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)))
        continue
      }

      const token = await response.json()
      const tokenInfo = token as TokenInfo
      // Cache successful lookups
      tokenCache.set(mintAddress, tokenInfo)
      return tokenInfo
    } catch (error) {
      if (attempt === retries - 1) {
        return null
      }
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)))
    }
  }
  
  return null
}

// Fetch token metadata from on-chain via our API route
async function fetchTokenFromJupiter(mintAddress: string): Promise<TokenInfo | null> {
  // Check cache first
  if (tokenCache.has(mintAddress)) {
    return tokenCache.get(mintAddress) || null
  }
  
  // Check if there's already a pending request for this token
  if (pendingRequests.has(mintAddress)) {
    return await pendingRequests.get(mintAddress)!
  }

  // Create a promise for this request
  const requestPromise = new Promise<TokenInfo | null>((resolve, reject) => {
    requestQueue.push({ mintAddress, resolve, reject })
    processRequestQueue()
  })
  
  pendingRequests.set(mintAddress, requestPromise)
  
  try {
    const result = await requestPromise
    return result
  } finally {
    pendingRequests.delete(mintAddress)
  }
}

// Common tokens for reference
export const KNOWN_TOKENS: Record<string, TokenInfo> = {
  USDC: {
    address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    decimals: 6,
    symbol: 'USDC',
    name: 'USD Coin',
    tags: ['stablecoin']
  },
  SOL: {
    address: 'So11111111111111111111111111111111111111112',
    decimals: 9,
    symbol: 'SOL',
    name: 'SOL',
    tags: []
  },
  CHAOS: {
    address: 'CHAOS9yUXnqTUmGBz9sx8UGPYyfF1ZSyfz9bUUkdEKnzY',
    decimals: 9,
    symbol: 'CHAOS',
    name: 'CHAOS',
    tags: []
  },
  LOGOS: {
    address: 'LOGOS9D6kUvwTnJJJSFcGM5db8qTNx8PgHqgLvHHuUPJR',
    decimals: 9,
    symbol: 'LOGOS',
    name: 'LOGOS',
    tags: []
  }
}

export async function getTokenByMint(mintAddress: string, allowBackgroundFetch = true): Promise<TokenInfo | null> {
  // First check known tokens
  const knownToken = Object.values(KNOWN_TOKENS).find(t => t.address === mintAddress)
  if (knownToken) {
    return knownToken
  }

  // Then check Jupiter tokens from static lookup
  const token = (tokenLookupData as TokenLookup)[mintAddress]
  if (token) {
    return {
      ...token,
      address: mintAddress
    }
  }

  // Check cache
  if (tokenCache.has(mintAddress)) {
    return tokenCache.get(mintAddress) || null
  }

  // If not found and background fetch is allowed, fetch in background (non-blocking)
  // Return default immediately so parsing can continue
  if (allowBackgroundFetch) {
    // Don't await - fetch in background
    fetchTokenFromJupiter(mintAddress).catch(() => {
      // Silently fail - default token info will be used
    })
  } else {
    // If background fetch not allowed, await the fetch
    const fetchedToken = await fetchTokenFromJupiter(mintAddress)
    if (fetchedToken) {
      return fetchedToken
    }
  }

  // Return default token info immediately (metadata will be fetched in background)
  return {
    symbol: mintAddress.slice(0, 6) + '...',
    name: 'Unknown Token',
    decimals: 9, // Most common decimal places in Solana
    address: mintAddress,
    tags: []
  }
} 