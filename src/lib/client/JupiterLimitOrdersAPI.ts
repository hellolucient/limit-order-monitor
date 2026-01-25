import { Connection, PublicKey, GetProgramAccountsFilter } from '@solana/web3.js'
import { TokenInfo, getTokenByMint } from '../types'
import type { LimitOrder } from '../types/limitOrder'
import axios from 'axios'

const JUPITER_LIMIT_PROGRAM_ID = new PublicKey('j1o2qRpjcyUwEvwtcfhEQefh773ZgjxcVRry7LDqg5X')
const BASE_DELAY = 1000
const MAX_DELAY = 8000

export interface TokenPrice {
    price: number;
    timestamp: number;
}

export async function fetchTokenPrice(tokenMint: string): Promise<TokenPrice> {
    try {
        const { data } = await axios.get<{ outAmount: number }>(
            `https://quote-api.jup.ag/v6/quote?inputMint=${tokenMint}&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&amount=1000000`
        );
        
        return {
            price: data.outAmount / 1000000,
            timestamp: Date.now()
        };
    } catch (error) {
        console.error('Error fetching token price:', error);
        throw error;
    }
}

export class JupiterLimitOrdersAPI {
  private connection: Connection

  constructor() {
    console.log('All env vars:', process.env);
    console.log('NODE_ENV:', process.env.NODE_ENV);
    console.log('NEXT_PUBLIC_RPC_URL:', process.env.NEXT_PUBLIC_RPC_URL);
    
    // Determine RPC URL based on environment
    let rpcUrl: string
    if (process.env.NODE_ENV === 'development') {
      // Use the local proxy in development
      rpcUrl = 'http://localhost:3000/api/rpc' 
      console.log('Using local RPC proxy for development:', rpcUrl)
    } else {
      // Use the environment variable in production/other environments
      rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || 'https://api.mainnet-beta.solana.com'
      console.log('Using configured RPC URL:', rpcUrl)
    }
    
    // Create the connection
    this.connection = new Connection(rpcUrl, {
      commitment: 'confirmed'
    })
  }

  private async retryWithBackoff<T>(
    operation: () => Promise<T>,
    retries = 3
  ): Promise<T> {
    for (let i = 0; i < retries; i++) {
      try {
        return await operation()
      } catch (error) {
        if (i === retries - 1) throw error
        const delay = Math.min(BASE_DELAY * Math.pow(2, i), MAX_DELAY)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
    throw new Error('Max retries reached')
  }

  async getOrders(tokenAddress: string): Promise<LimitOrder[]> {
    console.log('Fetching orders for:', tokenAddress)
    console.log('Using RPC connection:', this.connection.rpcEndpoint)
    
    try {
      // Validate token first - await the fetch to ensure we have metadata
      const tokenInfo = await getTokenByMint(tokenAddress, false)
      if (!tokenInfo) {
        throw new Error('Invalid token address')
      }

      const targetToken = new PublicKey(tokenAddress)
      const dataSize: GetProgramAccountsFilter = { dataSize: 372 }
      
      // Get sell orders (where token is input)
      const sellFilter: GetProgramAccountsFilter = { 
        memcmp: { offset: 40, bytes: targetToken.toBase58() }
      }
      
      // Get buy orders (where token is output)
      const buyFilter: GetProgramAccountsFilter = { 
        memcmp: { offset: 72, bytes: targetToken.toBase58() }
      }

      // Fetch orders with retry
      const [sellAccounts, buyAccounts] = await Promise.all([
        this.retryWithBackoff(() => 
          this.connection.getProgramAccounts(JUPITER_LIMIT_PROGRAM_ID, {
            filters: [dataSize, sellFilter]
          })
        ),
        this.retryWithBackoff(() => 
          this.connection.getProgramAccounts(JUPITER_LIMIT_PROGRAM_ID, {
            filters: [dataSize, buyFilter]
          })
        )
      ])

      console.log('Found raw orders:', {
        sell: sellAccounts.length,
        buy: buyAccounts.length
      })

      // Pre-fetch metadata for the tracked token and common quote currencies first
      // This ensures they're cached before parsing orders
      // Use allowBackgroundFetch=false to ensure we wait for these important tokens
      const SOL_MINT = 'So11111111111111111111111111111111111111112'
      const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
      
      await Promise.all([
        getTokenByMint(tokenAddress, false), // The token being tracked - await this one!
        getTokenByMint(SOL_MINT, false),    // Common quote currency - await this one!
        getTokenByMint(USDC_MINT, false)    // Common quote currency - await this one!
      ])

      // Parse orders (metadata will be fetched on-demand for other tokens, but cached)
      const sellOrders = await Promise.all(
        sellAccounts.map(acc => this.parseOrder(acc.pubkey, acc.account.data, 'SELL'))
      )
      const buyOrders = await Promise.all(
        buyAccounts.map(acc => this.parseOrder(acc.pubkey, acc.account.data, 'BUY'))
      )

      return [...sellOrders, ...buyOrders]

    } catch (error) {
      console.error('Failed to fetch orders:', error)
      throw error
    }
  }

  private async parseOrder(
    pubkey: PublicKey,
    data: Buffer,
    orderType: 'BUY' | 'SELL'
  ): Promise<LimitOrder> {
    const maker = new PublicKey(data.slice(8, 40))
    const inputMint = new PublicKey(data.slice(40, 72))
    const outputMint = new PublicKey(data.slice(72, 104))

    // Get token info - use background fetch mode to avoid blocking on metadata
    // This allows orders to parse quickly with default values, metadata loads in background
    const inputTokenInfo = await getTokenByMint(inputMint.toString(), true)
    const outputTokenInfo = await getTokenByMint(outputMint.toString(), true)

    // Parse amounts
    const dataView = new DataView(data.buffer, data.byteOffset)
    const makingAmount = this.parseAmount(dataView, 224, inputTokenInfo!.decimals)
    const takingAmount = this.parseAmount(dataView, 232, outputTokenInfo!.decimals)

    const price = orderType === 'BUY' 
      ? makingAmount / takingAmount
      : takingAmount / makingAmount

    // Parse timestamps with correct offsets
    const getTimestamp = (offset: number): string => {
      try {
        const low = dataView.getUint32(offset, true)
        const high = dataView.getUint32(offset + 4, true)
        const timestamp = low + (high * 4294967296) // 2^32
        return new Date(timestamp * 1000).toISOString()
      } catch {
        return new Date().toISOString()
      }
    }

    // Calculate correct offsets
    const expiredAtDiscriminator = data[248]
    const expiredAtLength = expiredAtDiscriminator === 1 ? 9 : 1
    const feeBpsStart = 248 + expiredAtLength
    const feeAccountStart = feeBpsStart + 2
    const createdAtStart = feeAccountStart + 32
    const updatedAtStart = createdAtStart + 8

    // Get timestamps
    const createdAt = getTimestamp(createdAtStart)

    // Debug: Look at different potential timestamp locations
    console.log('Data structure analysis:', {
      // Show more sections of the data to find the timestamp
      section1: Array.from(data.slice(240, 248)).map(b => b.toString(16).padStart(2, '0')).join(' '),
      section2: Array.from(data.slice(248, 256)).map(b => b.toString(16).padStart(2, '0')).join(' '),
      section3: Array.from(data.slice(256, 264)).map(b => b.toString(16).padStart(2, '0')).join(' '),
      // Try reading uint32 from different offsets
      timestamp240: dataView.getUint32(240, true),
      timestamp248: dataView.getUint32(248, true),
      timestamp256: dataView.getUint32(256, true),
      // Also show the full data length
      dataLength: data.length,
      // Show a hex dump of the entire data for analysis
      fullHex: Array.from(data).map(b => b.toString(16).padStart(2, '0')).join(' ')
    })

    return {
      id: pubkey.toString(),
      maker: maker.toString(),
      inputMint: inputTokenInfo!,
      outputMint: outputTokenInfo!,
      makingAmount,
      takingAmount,
      price,
      orderType,
      createdAt,
      status: 'open'
    }
  }

  private parseAmount(view: DataView, offset: number, decimals: number): number {
    const low = view.getUint32(offset, true)
    const high = view.getUint32(offset + 4, true)
    const amount = low + (high * 4294967296)
    return amount / Math.pow(10, decimals)
  }
}