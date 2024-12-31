import { PublicKey } from '@solana/web3.js'
import { TokenInfo } from './token'

export interface LimitOrder {
  id: string
  maker: string
  inputMint: TokenInfo
  outputMint: TokenInfo
  makingAmount: number
  takingAmount: number
  price: number
  orderType: 'BUY' | 'SELL'
  createdAt: string
  status: 'open' | 'filled' | 'cancelled'
}