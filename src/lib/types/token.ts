export interface TokenInfo {
  address: string
  symbol: string
  decimals: number
  isDecimalKnown: boolean
}

export interface TokenConfig {
  address: string
  symbol: string
  decimals: number
}

export const TOKENS: Record<'CHAOS' | 'LOGOS', TokenConfig> = {
  CHAOS: {
    address: 'CHAoS3vxjMHc7qgHF3QxEyMtY9myVhUwgw7Qk6Qx1Vw',
    symbol: 'CHAOS',
    decimals: 6
  },
  LOGOS: {
    address: 'LOGOS9s4uWxRgwH5qo4h5uFqZqQhad8RYXuGNhyMteF',
    symbol: 'LOGOS',
    decimals: 6
  }
} 