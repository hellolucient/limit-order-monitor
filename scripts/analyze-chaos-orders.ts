import { Connection } from '@solana/web3.js'
import { JupiterLimitOrdersAPI } from '../src/lib/client'
import { PriceService } from '../src/lib/services/PriceService'
import { LimitOrder, KNOWN_TOKENS } from '../src/lib/types'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: '.env.local' })

async function main() {
  const api = new JupiterLimitOrdersAPI()
  const chaosAddress = 'CHAOS...' // Add actual address

  try {
    const orders = await api.getOrders(chaosAddress)
    // Rest of analysis
  } catch (error) {
    console.error('Error:', error)
  }
}

// Run the analysis
main() 