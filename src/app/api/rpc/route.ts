import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL
  if (!rpcUrl) {
    return new NextResponse('RPC URL not configured', { status: 500 })
  }

  try {
    const body = await request.json()
    console.log('Proxying RPC request:', body)
    
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
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