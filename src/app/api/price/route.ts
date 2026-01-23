import { NextResponse } from 'next/server'
import axios from 'axios'

// Native Solana USDC address (verified as of 2024)
// This is the official USDC mint on Solana mainnet
const USDC_ADDRESS = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const tokenAddress = searchParams.get('tokenAddress')
  const amount = searchParams.get('amount')

  console.log('Price request received for:', {
    tokenAddress,
    amount
  })

  if (!tokenAddress || !amount) {
    return NextResponse.json(
      { error: 'Missing required parameters' },
      { status: 400 }
    )
  }

  try {
    // Jupiter Quote API - updated to use new endpoints
    // quote-api.jup.ag is deprecated, use lite-api.jup.ag (free) or api.jup.ag (with API key)
    const jupiterUrls = [
      `https://lite-api.jup.ag/swap/v1/quote?inputMint=${tokenAddress}&outputMint=${USDC_ADDRESS}&amount=${amount}&slippageBps=50`,
      // Fallback to api.jup.ag if lite-api doesn't work (may require API key)
      `https://api.jup.ag/swap/v1/quote?inputMint=${tokenAddress}&outputMint=${USDC_ADDRESS}&amount=${amount}&slippageBps=50`
    ]
    
    console.log('Fetching from Jupiter (trying multiple endpoints):', jupiterUrls[0])

    let response
    let lastError: any = null
    
    // Try each endpoint until one works
    for (const jupiterUrl of jupiterUrls) {
      try {
        console.log(`Trying endpoint: ${jupiterUrl}`)
        
        // Use axios with timeout and better error handling
        response = await axios.get(jupiterUrl, {
          headers: {
            'Accept': 'application/json'
          },
          timeout: 10000, // 10 second timeout
          validateStatus: (status) => status < 500 // Don't throw on 4xx errors
        })
        
        // If we got a response, break out of the loop
        break
      } catch (axiosError: any) {
        lastError = axiosError
        console.warn(`Failed to fetch from ${jupiterUrl}:`, {
          message: axiosError.message,
          code: axiosError.code
        })
        
        // If it's a DNS error and there are more endpoints, try the next one
        if (axiosError.code === 'ENOTFOUND' && jupiterUrls.indexOf(jupiterUrl) < jupiterUrls.length - 1) {
          console.log('DNS error, trying next endpoint...')
          continue
        }
        
        // For other errors or last endpoint, log and continue to next if available
        if (jupiterUrls.indexOf(jupiterUrl) < jupiterUrls.length - 1) {
          console.log('Error with endpoint, trying next...')
          continue
        }
        
        // If it's the last endpoint, we'll handle it after the loop
        lastError = axiosError
      }
    }
    
    // Check if we got a response from any endpoint
    if (!response) {
      // All endpoints failed - likely DNS issue
      const isDnsError = lastError?.code === 'ENOTFOUND'
      return NextResponse.json(
        { 
          error: isDnsError ? 'DNS resolution failed' : 'Network error', 
          code: lastError?.code || 'UNKNOWN',
          details: {
            message: lastError?.message || 'All Jupiter API endpoints failed',
            tokenAddress,
            suggestion: isDnsError 
              ? 'Unable to resolve quote-api.jup.ag. This may be a DNS/network configuration issue. Try: 1) Check your internet connection, 2) Try a different DNS server (8.8.8.8), 3) Check firewall settings.'
              : 'Network connectivity issue. Please check your internet connection.'
          }
        },
        { status: 500 }
      )
    }
    
    // Log successful response
    console.log('Jupiter API response:', {
      status: response.status,
      statusText: response.statusText,
      dataKeys: response.data ? Object.keys(response.data) : null
    })

    // Handle non-200 status codes
    if (response.status !== 200) {
      const errorResponse = response.data || {}
      const errorCode = errorResponse.errorCode || errorResponse.code
      
      if (response.status === 429) {
        console.warn(`Rate limit hit for token ${tokenAddress}`)
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { 
            status: 429,
            headers: {
              'Retry-After': response.headers['retry-after'] || '30'
            }
          }
        )
      }
      
      if (response.status === 400 && 
          (errorCode === 'COULD_NOT_FIND_ANY_ROUTE' || 
           errorCode === 'TOKEN_NOT_TRADABLE')) {
        console.info(`Token not available: ${tokenAddress} (${errorCode})`)
        return NextResponse.json(
          { 
            error: errorResponse.error || 'Token not available',
            code: errorCode
          },
          { status: 200 }
        )
      }
      
      console.warn(`Jupiter API error for ${tokenAddress}:`, errorResponse)
      return NextResponse.json(
        { error: `Jupiter API error: ${response.status}`, details: errorResponse },
        { status: response.status }
      )
    }

    const data = response.data

    // Handle different API response formats
    // Quote API v6 returns: { outAmount, ... }
    // Price API v3 returns: { data: { [tokenAddress]: { price: number, ... } } }
    let outAmount: number | undefined
    
    if (data.outAmount || data.outAmountWithSlippage) {
      // Quote API format - convert string to number if needed
      const rawOutAmount = data.outAmount || data.outAmountWithSlippage
      outAmount = typeof rawOutAmount === 'string' ? parseInt(rawOutAmount, 10) : rawOutAmount
    } else if (data.data && data.data[tokenAddress]) {
      // Price API v3 format - convert USD price to USDC amount
      const priceData = data.data[tokenAddress]
      const usdPrice = priceData.price || priceData.usdPrice
      if (usdPrice) {
        // Price API returns price per token in USD
        // We need to convert the input amount to USDC
        // For 1 token = $X, so amount tokens = amount * $X
        // Convert to USDC (6 decimals): amount * price * 1_000_000
        const inputDecimals = parseInt(amount.toString()) === 1000000 ? 6 : 9 // Assume 6 for most, 9 for SOL
        const inputAmount = parseInt(amount.toString()) / Math.pow(10, inputDecimals)
        outAmount = Math.floor(inputAmount * usdPrice * 1_000_000) // Convert to USDC (6 decimals)
      }
    }
    
    if (!outAmount) {
      console.warn('Jupiter API response missing price data:', {
        tokenAddress,
        responseKeys: Object.keys(data),
        fullResponse: data
      })
      // Some tokens might not have direct routes, return a structured error
      return NextResponse.json(
        { 
          error: 'No price data available',
          code: 'NO_PRICE_DATA',
          details: 'Token may not have a direct trading route to USDC'
        },
        { status: 200 } // Return 200 so PriceService can handle it gracefully
      )
    }

    console.log('Jupiter API success for token:', {
      tokenAddress,
      outAmount: outAmount,
      apiFormat: data.outAmount ? 'quote' : 'price'
    })
    
    // Return the data with normalized outAmount
    return NextResponse.json({
      ...data,
      outAmount: outAmount
    })
  } catch (error: any) {
    const errorDetails = {
      message: error.message,
      stack: error.stack,
      tokenAddress,
      amount
    }
    console.error('Price fetch error:', errorDetails)
    return NextResponse.json(
      { error: 'Failed to fetch price', details: errorDetails },
      { status: 500 }
    )
  }
} 