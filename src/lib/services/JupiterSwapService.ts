import axios from 'axios'
import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js'

export interface SwapQuote {
  inputMint: string
  outputMint: string
  inAmount: string
  outAmount: string
  priceImpactPct: number
  routePlan: any[]
}

export interface SwapTransaction {
  swapTransaction: string // Base64 encoded transaction
}

export class JupiterSwapService {
  private baseUrl = 'https://quote-api.jup.ag/v6'

  /**
   * Get a quote for a swap
   */
  async getQuote(
    inputMint: string,
    outputMint: string,
    amount: number,
    inputDecimals: number = 9, // Default to 9 decimals (SOL standard)
    slippageBps: number = 50 // 0.5% default slippage
  ): Promise<SwapQuote> {
    try {
      // Convert amount to smallest unit using provided decimals
      const amountInSmallestUnit = Math.floor(amount * Math.pow(10, inputDecimals))

      const response = await axios.get(`${this.baseUrl}/quote`, {
        params: {
          inputMint,
          outputMint,
          amount: amountInSmallestUnit,
          slippageBps,
        },
      })

      return response.data
    } catch (error: any) {
      console.error('Error getting Jupiter quote:', error)
      throw new Error(`Failed to get quote: ${error.message}`)
    }
  }

  /**
   * Get swap transaction from Jupiter
   */
  async getSwapTransaction(
    quote: SwapQuote,
    userPublicKey: string,
    wrapUnwrapSOL: boolean = true,
    dynamicComputeUnitLimit: boolean = true,
    prioritizationFeeLamports: string = 'auto'
  ): Promise<SwapTransaction> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/swap`,
        {
          quoteResponse: quote,
          userPublicKey,
          wrapUnwrapSOL,
          dynamicComputeUnitLimit,
          prioritizationFeeLamports,
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      )

      return response.data
    } catch (error: any) {
      console.error('Error getting swap transaction:', error)
      throw new Error(`Failed to get swap transaction: ${error.message}`)
    }
  }

  /**
   * Deserialize and return transaction for signing
   */
  deserializeTransaction(swapTransaction: string): VersionedTransaction {
    const transactionBuf = Buffer.from(swapTransaction, 'base64')
    return VersionedTransaction.deserialize(transactionBuf)
  }

  /**
   * Execute a swap (get quote, get transaction, sign, and send)
   */
  async executeSwap(
    inputMint: string,
    outputMint: string,
    amount: number,
    inputDecimals: number,
    userPublicKey: string,
    signTransaction: (tx: VersionedTransaction) => Promise<VersionedTransaction>,
    sendTransaction: (tx: VersionedTransaction) => Promise<string>
  ): Promise<string> {
    try {
      // Step 1: Get quote
      const quote = await this.getQuote(inputMint, outputMint, amount, inputDecimals)

      // Step 2: Get swap transaction
      const swapTxData = await this.getSwapTransaction(quote, userPublicKey)

      // Step 3: Deserialize transaction
      const transaction = this.deserializeTransaction(swapTxData.swapTransaction)

      // Step 4: Sign transaction
      const signedTransaction = await signTransaction(transaction)

      // Step 5: Send transaction
      const signature = await sendTransaction(signedTransaction)

      return signature
    } catch (error: any) {
      console.error('Error executing swap:', error)
      throw new Error(`Swap failed: ${error.message}`)
    }
  }
}
