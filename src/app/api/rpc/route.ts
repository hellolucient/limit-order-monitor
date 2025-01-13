import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL
  if (!rpcUrl) {
    return new NextResponse('RPC URL not configured', { status: 500 })
  }

  try {
    const body = await request.json()
    console.log('Proxying RPC request:', body)
    
    // Parse the API key from the RPC URL
    const url = new URL(rpcUrl)
    const apiKey = url.searchParams.get('api-key')
    
    // Remove the API key from the URL
    url.searchParams.delete('api-key')
    const cleanRpcUrl = url.toString()
    
    const response = await fetch(cleanRpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Add the API key in the header
        'x-api-key': apiKey || '',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: body.id || '1',
        method: body.method,
        params: body.params
      })
    })

    const data = await response.json()
    console.log('RPC response:', data)
    
    // Return raw response with proper headers
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