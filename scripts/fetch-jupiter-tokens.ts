import axios from 'axios'
import fs from 'fs'
import path from 'path'

interface JupiterToken {
  address: string
  symbol: string
  name: string
  decimals: number
  tags?: string[]
  logoURI?: string
  daily_volume?: number
  mint_authority?: string | null
}

interface TokenLookup {
  [address: string]: {
    symbol: string
    name: string
    decimals: number
    mint_authority?: string
    tags: string[]
  }
}

async function fetchTokens() {
  console.log('🟢 Starting Jupiter token fetch...')
  
  try {
    const { data } = await axios.get<JupiterToken[]>('https://tokens.jup.ag/tokens?tags=verified', {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json',
        'Referer': 'https://jup.ag',
        'Origin': 'https://jup.ag'
      }
    })

    console.log(`✅ Found ${data.length} verified tokens`)
    
    // Convert to lookup format
    const tokenLookup: TokenLookup = {}
    
    data.forEach((token) => {
      tokenLookup[token.address] = {
        symbol: token.symbol,
        name: token.name,
        decimals: token.decimals,
        mint_authority: token.mint_authority || undefined,
        tags: token.tags || []
      }
    })

    // Ensure directory exists
    const dataDir = path.join(process.cwd(), 'src', 'lib', 'data')
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true })
    }

    // Save to file
    const outputPath = path.join(dataDir, 'token-lookup.json')
    fs.writeFileSync(outputPath, JSON.stringify(tokenLookup, null, 2))

    console.log('💾 Token lookup saved to:', outputPath)
    console.log(`📊 Total tokens indexed: ${Object.keys(tokenLookup).length}`)

  } catch (error: any) {
    if (error?.response) {  // Axios error
      console.error('🔴 Network Error:', error.message)
      console.error('Response:', error.response.data)
    } else {
      console.error('🔴 Error:', error)
    }
    process.exit(1)
  }
}

fetchTokens() 