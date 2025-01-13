import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL?.trim()  // Trim any whitespace
  console.log('Raw RPC URL:', rpcUrl)
  
  if (!rpcUrl) {
    console.error('RPC URL not configured')
    return new NextResponse('RPC URL not configured', { status: 500 })
  }

  try {
    const body = await request.json()
    console.log('Proxying RPC request:', body)
    
    // Parse the API key from the RPC URL
    const url = new URL(rpcUrl)
    const apiKey = url.searchParams.get('api-key')?.trim() // Trim any whitespace from the key
    console.log('Found API key:', apiKey ? 'yes (length: ' + apiKey.length + ')' : 'no')
    
    if (!apiKey) {
      console.error('No API key found in RPC URL')
      return new NextResponse(JSON.stringify({
        jsonrpc: '2.0',
        error: {
          code: -32401,
          message: 'API key not found in RPC URL'
        },
        id: null
      }), { 
        status: 401,
        headers: {
          'Content-Type': 'application/json',
        }
      })
    }
    
    // For Helius, construct the URL without query parameters
    const baseUrl = url.origin
    console.log('Using Helius base URL:', baseUrl)
    
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: body.id || '1',
        method: body.method,
        params: body.params
      })
    })

    const data = await response.json()
    console.log('RPC response status:', response.status)
    if (response.status !== 200) {
      console.log('Error response:', data)
    }
    
    return new NextResponse(JSON.stringify(data), {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
      }
    })
  } catch (error) {
    console.error('RPC proxy error:', error)
    return new NextResponse(JSON.stringify({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: 'Internal error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      id: null
    }), { 
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      }
    })
  }
} 