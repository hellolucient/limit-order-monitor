import { PublicKey } from '@solana/web3.js'

export interface TokenInfo {
  address: string
  symbol: string
  decimals: number
  isDecimalKnown: boolean
}

export interface LimitOrder {
  id: string
  maker: PublicKey
  inputMint: TokenInfo
  outputMint: TokenInfo
  makingAmount: number
  takingAmount: number
  oriMakingAmount: number
  oriTakingAmount: number
  borrowMakingAmount: number
  price: number
  priceUSDC?: number
  totalUSDC?: number
  status: 'open' | 'filled' | 'cancelled'
  createdAt: string
  updatedAt: string
  expiredAt?: string
  tokenType: 'LOGOS' | 'CHAOS'
  orderType: 'BUY' | 'SELL'
  feeBps: number
  feeAccount: string
  bump: number
  inputTokenProgram: string
  outputTokenProgram: string
  inputMintReserve: string
  uniqueId: string
} 