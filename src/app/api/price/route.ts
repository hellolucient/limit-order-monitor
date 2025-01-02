import { NextResponse } from 'next/server'

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
    const jupiterUrl = `https://quote-api.jup.ag/v6/quote?inputMint=${tokenAddress}&outputMint=${USDC_ADDRESS}&amount=${amount}`
    console.log('Fetching from Jupiter:', jupiterUrl)

    const response = await fetch(jupiterUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      },
      cache: 'no-store' // Disable caching to avoid stale 429 responses
    })

    const responseText = await response.text()
    console.log('Jupiter API response:', {
      status: response.status,
      body: responseText
    })

    if (!response.ok) {
      const errorDetails = {
        tokenAddress,
        status: response.status,
        statusText: response.statusText,
        error: responseText,
        headers: Object.fromEntries(response.headers.entries())
      }
      
      // Parse error response
      let errorResponse
      try {
        errorResponse = JSON.parse(responseText)
      } catch {
        errorResponse = { error: responseText }
      }

      // Handle specific error cases
      if (response.status === 429) {
        console.warn(`Rate limit hit for token ${tokenAddress}`)
        return NextResponse.json(
          { error: 'Rate limit exceeded', details: errorDetails },
          { 
            status: 429,
            headers: {
              'Retry-After': response.headers.get('Retry-After') || '30'
            }
          }
        )
      }

      // Handle expected errors quietly (no route, not tradable)
      if (response.status === 400 && 
          (errorResponse?.errorCode === 'COULD_NOT_FIND_ANY_ROUTE' || 
           errorResponse?.errorCode === 'TOKEN_NOT_TRADABLE')) {
        console.info(`Token not available: ${tokenAddress} (${errorResponse.errorCode})`)
        return NextResponse.json(
          { 
            error: errorResponse.error || 'Token not available',
            code: errorResponse.errorCode
          },
          { status: 200 }  // Return 200 instead of 400 for expected cases
        )
      }

      // Log other errors as warnings
      console.warn(`Jupiter API error for ${tokenAddress}:`, errorResponse)
      return NextResponse.json(
        { error: `Jupiter API error: ${response.status}`, details: errorDetails },
        { status: response.status }
      )
    }

    let data
    try {
      data = JSON.parse(responseText)
    } catch (e) {
      console.error('Failed to parse Jupiter API response:', e)
      return NextResponse.json(
        { error: 'Invalid response from Jupiter API' },
        { status: 500 }
      )
    }

    console.log('Jupiter API success for token:', {
      tokenAddress,
      outAmount: data.outAmount
    })
    return NextResponse.json(data)
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