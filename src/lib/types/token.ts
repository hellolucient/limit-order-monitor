import tokenLookupData from '../data/token-lookup.json'

export interface TokenInfo {
  symbol: string
  name: string
  decimals: number
  mint_authority?: string
  tags: string[]
  address: string
}

export interface TokenLookup {
  [address: string]: Omit<TokenInfo, 'address'>
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

export function getTokenByMint(mintAddress: string): TokenInfo | null {
  console.log('Looking up token:', mintAddress)
  
  // First check known tokens
  const knownToken = Object.values(KNOWN_TOKENS).find(t => t.address === mintAddress)
  if (knownToken) {
    console.log('Found in KNOWN_TOKENS:', knownToken)
    return knownToken
  }

  // Then check Jupiter tokens
  console.log('Checking Jupiter data:', {
    hasData: !!tokenLookupData,
    mintExists: tokenLookupData ? mintAddress in tokenLookupData : false
  })
  
  const token = (tokenLookupData as TokenLookup)[mintAddress]
  if (!token) {
    console.log('Token not found in Jupiter data, creating default token info')
    // Return a default token info for unknown tokens
    return {
      symbol: mintAddress.slice(0, 6) + '...',
      name: 'Unknown Token',
      decimals: 9, // Most common decimal places in Solana
      address: mintAddress,
      tags: []
    }
  }
  
  console.log('Found in Jupiter data:', token)
  return {
    ...token,
    address: mintAddress
  }
} 