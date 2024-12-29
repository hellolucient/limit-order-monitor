import { PublicKey } from '@solana/web3.js'
import { TokenInfo } from './token'

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
  status: 'open' | 'filled' | 'cancelled'
  createdAt: string
  updatedAt: string
  expiredAt?: string
  tokenType: 'CHAOS' | 'LOGOS'
  orderType: 'BUY' | 'SELL'
  feeBps: number
  feeAccount: string
  bump: number
  inputTokenProgram: string
  outputTokenProgram: string
  inputMintReserve: string
  uniqueId: string
}