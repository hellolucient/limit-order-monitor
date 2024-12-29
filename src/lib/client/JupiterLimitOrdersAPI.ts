import { Connection, PublicKey, GetProgramAccountsFilter } from '@solana/web3.js'
import { TOKENS } from '../utils/tokenConfig'
import { LimitOrder, TokenInfo } from '../types'

const JUPITER_LIMIT_PROGRAM_ID = new PublicKey('j1o2qRpjcyUwEvwtcfhEQefh773ZgjxcVRry7LDqg5X')

// Cache for token decimals to reduce RPC calls
const TOKEN_DECIMALS_CACHE = new Map<string, number>()

// At the top, add constants for delays
const BASE_DELAY = 2000  // Increase base delay
const MAX_DELAY = 10000  // Cap the max delay
const RATE_LIMIT_MULTIPLIER = 1.5  // Less aggressive backoff

export class JupiterLimitOrdersAPI {
  private connection: Connection

  constructor(connection: Connection) {
    console.log('🏗️ Initializing Jupiter API...')
    this.connection = connection
    
    // Verify connection on instantiation
    this.verifyConnection()
  }

  private async verifyConnection() {
    try {
      const version = await this.connection.getVersion()
      console.log('✅ Connected to Solana - Version:', version)
    } catch (error) {
      console.error('❌ Failed to connect to Solana:', error)
      throw new Error('Failed to connect to Solana RPC')
    }
  }

  private async getTokenDecimals(mint: PublicKey, useBackup = false): Promise<number> {
    const mintStr = mint.toString()
    
    // Check cache first
    if (TOKEN_DECIMALS_CACHE.has(mintStr)) {
      return TOKEN_DECIMALS_CACHE.get(mintStr)!
    }

    // Check our known tokens
    const knownToken = Object.values(TOKENS).find(
      (t): t is typeof TOKENS[keyof typeof TOKENS] => t.address === mintStr
    )
    if (knownToken) {
      TOKEN_DECIMALS_CACHE.set(mintStr, knownToken.decimals)
      return knownToken.decimals
    }

    // Fetch from chain as last resort
    try {
      const connection = useBackup 
        ? new Connection(process.env.RPC_ENDPOINT || '')
        : this.connection

      const info = await connection.getParsedAccountInfo(mint)
      if (info.value?.data && 'parsed' in info.value.data) {
        const decimals = info.value.data.parsed.info.decimals
        TOKEN_DECIMALS_CACHE.set(mintStr, decimals)
        return decimals
      }
    } catch (error) {
      console.error(`Error getting decimals for ${mintStr}:`, error)
      if (error instanceof Error) {
        throw error
      }
      throw new Error('Unknown error getting token decimals')
    }

    // Default to 6 if all else fails
    return 6
  }

  private async getTokenInfo(mint: string, useBackup = false): Promise<TokenInfo> {
    const knownToken = Object.values(TOKENS).find(
      (t): t is typeof TOKENS[keyof typeof TOKENS] => t.address === mint
    )
    
    // If it's a known token, don't even hit the RPC
    if (knownToken) {
      return {
        address: mint,
        symbol: knownToken.symbol,
        decimals: knownToken.decimals,
        isDecimalKnown: true
      }
    }
    
    const decimals = await this.getTokenDecimals(new PublicKey(mint), useBackup)
    
    return {
      address: mint,
      symbol: 'UNKNOWN',
      decimals,
      isDecimalKnown: false
    }
  }

  private parseRawOrder = async (
    orderAccount: PublicKey,
    data: Buffer,
    orderType: 'BUY' | 'SELL',
    useBackup = false
  ): Promise<LimitOrder> => {
    const maker = new PublicKey(data.slice(8, 40))
    const inputMint = new PublicKey(data.slice(40, 72))
    const outputMint = new PublicKey(data.slice(72, 104))

    // Get token info sequentially instead of parallel
    const inputTokenInfo = await this.getTokenInfo(inputMint.toString(), useBackup)
    await new Promise(resolve => setTimeout(resolve, 500)) // Add small delay between requests
    const outputTokenInfo = await this.getTokenInfo(outputMint.toString(), useBackup)

    // Parse amounts without using BigInt
    const dataView = new DataView(data.buffer, data.byteOffset)
    const parseAmount = (offset: number, decimals: number): number => {
      try {
        const low = dataView.getUint32(offset, true)
        const high = dataView.getUint32(offset + 4, true)
        const amount = low + (high * 4294967296) // 2^32
        return amount / Math.pow(10, decimals)
      } catch {
        return 0
      }
    }

    const getMakingAmount = (offset: number) => parseAmount(offset, inputTokenInfo.decimals)
    const getTakingAmount = (offset: number) => parseAmount(offset, outputTokenInfo.decimals)

    // Parse timestamps
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

    // Check for expiry first
    const expiredAtDiscriminator = data[248]
    let expiredAt: string | undefined

    // Calculate offsets based on expiredAt length
    const expiredAtLength = expiredAtDiscriminator === 1 ? 9 : 1
    const feeBpsStart = 248 + expiredAtLength  // feeBps is 2 bytes
    const feeAccountStart = feeBpsStart + 2    // feeAccount is 32 bytes
    const createdAtStart = feeAccountStart + 32 // createdAt is 8 bytes
    const updatedAtStart = createdAtStart + 8   // updatedAt is 8 bytes

    // Parse timestamps with correct offsets
    const createdAt = getTimestamp(createdAtStart)
    const updatedAt = getTimestamp(updatedAtStart)

    // Parse expiredAt if it exists
    if (expiredAtDiscriminator === 1) {
      expiredAt = getTimestamp(249)
    }

    // Determine token type based on the output mint for buy orders and input mint for sell orders
    const tokenMint = orderType === 'BUY' ? outputMint : inputMint
    const tokenType = tokenMint.equals(new PublicKey(TOKENS.CHAOS.address)) ? 'CHAOS' : 'LOGOS'

    // For buy orders:
    // - makingAmount is what we're paying (e.g. USDC)
    // - takingAmount is what we're getting (e.g. LOGOS)
    const makingAmount = getMakingAmount(224)
    const takingAmount = getTakingAmount(232)
    const oriMakingAmount = getMakingAmount(208)
    const oriTakingAmount = getTakingAmount(216)
    const borrowMakingAmount = getMakingAmount(240)

    // Calculate price based on order type
    const price = orderType === 'BUY' 
      ? makingAmount / takingAmount  // For buy orders: input/output (e.g. USDC/LOGOS)
      : takingAmount / makingAmount // For sell orders: output/input (e.g. USDC/LOGOS)

    console.log(`${orderType} Order for ${tokenType}:`, {
      makingAmount,
      takingAmount,
      price,
      inputToken: inputTokenInfo.symbol,
      outputToken: outputTokenInfo.symbol
    })

    return {
      id: orderAccount.toString(),
      maker,
      inputMint: inputTokenInfo,
      outputMint: outputTokenInfo,
      makingAmount,
      takingAmount,
      oriMakingAmount,
      oriTakingAmount,
      borrowMakingAmount,
      price,
      status: 'open',
      createdAt,
      updatedAt,
      expiredAt,
      tokenType,
      orderType,
      feeBps: dataView.getUint16(250, true),
      feeAccount: new PublicKey(data.slice(252, 284)).toString(),
      bump: data[299],
      inputTokenProgram: new PublicKey(data.slice(104, 136)).toString(),
      outputTokenProgram: new PublicKey(data.slice(136, 168)).toString(),
      inputMintReserve: new PublicKey(data.slice(168, 200)).toString(),
      uniqueId: parseAmount(200, 0).toString()
    }
  }

  private async retryGetProgramAccounts(
    filters: GetProgramAccountsFilter[], 
    maxAttempts = 3, 
    delayMs = BASE_DELAY
  ): Promise<Array<{ pubkey: PublicKey; account: { data: Buffer } }>> {
    const memcmpFilter = filters[1] as { memcmp: { offset: number, bytes: string } }
    const orderType = memcmpFilter.memcmp.offset === 40 ? 'SELL' : 'BUY'
    const tokenType = memcmpFilter.memcmp.bytes === new PublicKey(TOKENS.CHAOS.address).toBase58() ? 'CHAOS' : 'LOGOS'
    
    let currentConnection = this.connection
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // Add delay between attempts
        if (attempt > 1) {
          await new Promise(resolve => setTimeout(resolve, Math.min(delayMs, MAX_DELAY)))
        }

        console.log(`🔄 Attempt ${attempt} for ${tokenType} ${orderType} orders using ${
          currentConnection === this.connection ? 'primary' : 'backup'
        } RPC...`)

        const accounts = await currentConnection.getProgramAccounts(JUPITER_LIMIT_PROGRAM_ID, {
          filters
        })

        if (accounts.length > 0) {
          console.log(`✅ ${tokenType} ${orderType}: Got ${accounts.length} orders`)
          return [...accounts]
        }

        console.log(`⚠️ ${tokenType} ${orderType}: No orders found, attempt ${attempt}/${maxAttempts}`)
      } catch (err) {
        const error = err as Error  // Type assertion
        console.warn(`❌ ${tokenType} ${orderType}: Attempt ${attempt} failed:`, error)

        // If we hit rate limit and haven't tried backup yet
        if (error.toString().includes('429') && currentConnection === this.connection) {
          console.log('⚡ Switching to backup RPC...')
          const backupRpc = process.env.RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com'
          currentConnection = new Connection(backupRpc)
          // Don't count this as an attempt, just switch RPC and try again
          attempt--
          continue
        }

        // If we're already on backup or it's not a rate limit
        if (attempt === maxAttempts) {
          throw new Error(error.message || 'Unknown error in retryGetProgramAccounts')
        }
        delayMs = Math.min(delayMs * RATE_LIMIT_MULTIPLIER, MAX_DELAY)
        await new Promise(resolve => setTimeout(resolve, delayMs))
      }
    }
    return []
  }

  async getLimitOrders(): Promise<LimitOrder[]> {
    try {
      console.log('🚀 Starting to fetch limit orders...')
      const CHAOS_MINT = new PublicKey(TOKENS.CHAOS.address)
      const LOGOS_MINT = new PublicKey(TOKENS.LOGOS.address)

      const dataSize: GetProgramAccountsFilter = { dataSize: 372 }
      const chaosInputFilter: GetProgramAccountsFilter = { memcmp: { offset: 40, bytes: CHAOS_MINT.toBase58() }}
      const logosInputFilter: GetProgramAccountsFilter = { memcmp: { offset: 40, bytes: LOGOS_MINT.toBase58() }}
      const chaosOutputFilter: GetProgramAccountsFilter = { memcmp: { offset: 72, bytes: CHAOS_MINT.toBase58() }}
      const logosOutputFilter: GetProgramAccountsFilter = { memcmp: { offset: 72, bytes: LOGOS_MINT.toBase58() }}

      // Fetch in parallel again
      const [chaosSellOrders, logosSellOrders, chaosBuyOrders, logosBuyOrders] = await Promise.all([
        this.retryGetProgramAccounts([dataSize, chaosInputFilter]),
        this.retryGetProgramAccounts([dataSize, logosInputFilter]),
        this.retryGetProgramAccounts([dataSize, chaosOutputFilter]),
        this.retryGetProgramAccounts([dataSize, logosOutputFilter])
      ])

      console.log('📊 Raw order counts:', {
        chaosSell: chaosSellOrders.length,
        logosSell: logosSellOrders.length,
        chaosBuy: chaosBuyOrders.length,
        logosBuy: logosBuyOrders.length
      })

      // Parse in parallel but in smaller batches
      const parseOrders = async (orders: any[], orderType: 'BUY' | 'SELL') => {
        const results: LimitOrder[] = []
        const batchSize = 10
        
        for (let i = 0; i < orders.length; i += batchSize) {
          const batch = orders.slice(i, i + batchSize)
          const parsed = await Promise.all(
            batch.map(o => this.parseRawOrder(o.pubkey, o.account.data, orderType))
          )
          results.push(...parsed)
        }
        
        return results
      }

      const orders = [
        ...await parseOrders(chaosSellOrders, 'SELL'),
        ...await parseOrders(logosSellOrders, 'SELL'),
        ...await parseOrders(chaosBuyOrders, 'BUY'),
        ...await parseOrders(logosBuyOrders, 'BUY')
      ]

      // Log final counts by type
      const finalCounts = orders.reduce((acc, order) => {
        const key = `${order.tokenType}_${order.orderType}`
        acc[key] = (acc[key] || 0) + 1
        return acc
      }, {} as Record<string, number>)

      console.log('📈 Final parsed order counts:', finalCounts)
      return orders
    } catch (error) {
      console.error('Error fetching limit orders:', error)
      if (error instanceof Error) {
        throw error
      }
      throw new Error('Unknown error fetching limit orders')
    }
  }
} 