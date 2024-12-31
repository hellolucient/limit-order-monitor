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
      console.error('Jupiter API error:', errorDetails)
      
      // Special handling for rate limits
      if (response.status === 429) {
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