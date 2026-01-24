import axios from 'axios'
import { PublicKey, VersionedTransaction, Connection } from '@solana/web3.js'

export interface CreateLimitOrderParams {
  maker: string // Wallet address (public key as string)
  payer: string // Wallet address paying for transaction fees
  inputMint: string // Input token mint address
  outputMint: string // Output token mint address
  inAmount: string // Amount you're giving (in smallest unit, e.g., lamports or token decimals)
  outAmount: string // Amount you want to receive (in smallest unit)
  expiry?: number // Optional: Unix timestamp for order expiry
  feeAccount?: string // Optional: Referral fee account
}

export interface CreateOrderResponse {
  tx?: string // Base64 encoded transaction (legacy format)
  transaction?: string // Base64 encoded transaction (new format)
  transactions?: string[] // Array of transactions (if multiple)
  requestId: string // Used for executing the order
}

export class JupiterLimitOrderService {
  private baseUrl = 'https://api.jup.ag/trigger/v1'
  private apiKey: string | undefined

  constructor() {
    // Get API key from environment variable (client-side)
    // Next.js exposes NEXT_PUBLIC_* variables to the browser
    // Note: These are embedded at build time, so you may need to restart the dev server
    this.apiKey = typeof window !== 'undefined' 
      ? (window as any).__NEXT_DATA__?.env?.NEXT_PUBLIC_JUPITER_API_KEY 
        || process.env.NEXT_PUBLIC_JUPITER_API_KEY
      : process.env.NEXT_PUBLIC_JUPITER_API_KEY
    
    // Also try direct access
    if (!this.apiKey) {
      this.apiKey = process.env.NEXT_PUBLIC_JUPITER_API_KEY
    }
    
    if (!this.apiKey) {
      console.warn('⚠️ Jupiter API key not found. Limit order creation will fail.')
      console.warn('Make sure NEXT_PUBLIC_JUPITER_API_KEY is in your .env file and restart the dev server.')
    } else {
      console.log('✅ Jupiter API key loaded:', this.apiKey.substring(0, 8) + '...')
    }
  }

  /**
   * Create a limit order using Jupiter's Trigger API
   * Returns a transaction that needs to be signed and executed
   * Note: Requires Jupiter API key - get one at https://station.jup.ag
   */
  async createOrder(params: CreateLimitOrderParams): Promise<CreateOrderResponse> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }

      // Add API key if available
      if (this.apiKey) {
        headers['x-api-key'] = this.apiKey
      }

      // Check if API key is available
      if (!this.apiKey) {
        throw new Error(
          'Jupiter API key not found. Please add NEXT_PUBLIC_JUPITER_API_KEY to your .env file and restart the dev server.'
        )
      }

      // Prepare request body - API expects root-level fields + params.makingAmount/takingAmount
      const requestBody: any = {
        maker: params.maker,
        payer: params.payer,
        inputMint: params.inputMint,
        outputMint: params.outputMint,
        params: {
          makingAmount: params.inAmount, // Amount you're giving (as string)
          takingAmount: params.outAmount, // Amount you want to receive (as string)
          ...(params.expiry && { expiry: params.expiry }),
          ...(params.feeAccount && { feeAccount: params.feeAccount }),
        }
      }

      // Log the request for debugging
      console.log('Creating limit order - full request body:', JSON.stringify(requestBody, null, 2))
      console.log('API Key present:', !!this.apiKey)

      const response = await axios.post(
        `${this.baseUrl}/createOrder`,
        requestBody,
        {
          headers,
        }
      )

      const data = response.data
      console.log('Jupiter createOrder response:', {
        hasTx: !!data.tx,
        hasTransaction: !!data.transaction,
        hasTransactions: !!data.transactions,
        requestId: data.requestId,
        fullResponse: data,
      })
      
      return data
    } catch (error: any) {
      console.error('Error creating limit order:', error)
      console.error('Error details:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message,
      })
      
      // Provide helpful error messages
      if (error.response?.status === 401) {
        throw new Error(
          'Jupiter API key required. Please add NEXT_PUBLIC_JUPITER_API_KEY to your .env.local file. ' +
          'Get an API key at https://station.jup.ag'
        )
      }
      
      if (error.response?.status === 400) {
        const errorData = error.response?.data
        console.error('Jupiter API 400 error details:', errorData)
        
        // Log ZodError issues if present
        if (errorData?.error?.issues) {
          console.error('ZodError validation issues (full):', JSON.stringify(errorData.error.issues, null, 2))
          const issues = errorData.error.issues.map((issue: any) => 
            `${issue.path?.join('.') || 'root'}: ${issue.message}`
          ).join(', ')
          throw new Error(`Invalid limit order request: ${issues}`)
        }
        
        // Check for order size error specifically
        const errorMessage = errorData?.error?.message || errorData?.error || JSON.stringify(errorData)
        if (typeof errorMessage === 'string' && errorMessage.includes('Order size must be at least')) {
          // Extract Jupiter's calculated USD value from error
          const usdMatch = errorMessage.match(/received: ([\d.]+)/)
          const jupiterUsd = usdMatch ? parseFloat(usdMatch[1]) : null
          throw new Error(
            `Order size too small: Jupiter calculated this order as $${jupiterUsd?.toFixed(2) || 'unknown'}, but minimum is $5.00. ` +
            `This may be due to price differences between our display and Jupiter's calculation. ` +
            `Please increase the order size to at least $6-7 to account for price variations.`
          )
        }
        throw new Error(`Invalid limit order request: ${errorMessage}`)
      }
      
      throw new Error(`Failed to create limit order: ${error.message}`)
    }
  }

  /**
   * Deserialize the transaction for signing
   */
  deserializeTransaction(txBase64: string): VersionedTransaction {
    const transactionBuf = Buffer.from(txBase64, 'base64')
    return VersionedTransaction.deserialize(transactionBuf)
  }

  /**
   * Get transaction from response (handles both 'tx' and 'transaction' formats)
   */
  getTransactionFromResponse(response: CreateOrderResponse): string {
    // Try different response formats
    if (response.transaction) {
      return response.transaction
    }
    if (response.tx) {
      return response.tx
    }
    if (response.transactions && response.transactions.length > 0) {
      return response.transactions[0]
    }
    throw new Error('No transaction found in response')
  }

  /**
   * Execute a limit order (create, sign, and send)
   */
  async executeLimitOrder(
    params: CreateLimitOrderParams,
    signTransaction: (tx: VersionedTransaction) => Promise<VersionedTransaction>,
    sendTransaction: (tx: VersionedTransaction) => Promise<string>
  ): Promise<string> {
    try {
      // Step 1: Create the order (get transaction)
      const orderResponse = await this.createOrder(params)
      const txBase64 = this.getTransactionFromResponse(orderResponse)

      // Step 2: Deserialize transaction
      const transaction = this.deserializeTransaction(txBase64)

      // Step 3: Sign transaction
      const signedTransaction = await signTransaction(transaction)

      // Step 4: Send transaction
      const signature = await sendTransaction(signedTransaction)

      return signature
    } catch (error: any) {
      console.error('Error executing limit order:', error)
      throw new Error(`Limit order failed: ${error.message}`)
    }
  }
}
