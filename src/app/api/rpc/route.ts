import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL
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
    console.log('URL params:', Object.fromEntries(url.searchParams.entries()))
    
    const apiKey = url.searchParams.get('api-key')
    console.log('Found API key:', apiKey ? 'yes (length: ' + apiKey.length + ')' : 'no')
    
    // Remove the API key from the URL
    url.searchParams.delete('api-key')
    const cleanRpcUrl = url.toString()
    console.log('Clean RPC URL:', cleanRpcUrl)
    
    // Check if API key might be in a different format
    const possibleApiKey = new URLSearchParams(url.search).get('apiKey') || 
                          new URLSearchParams(url.search).get('key') ||
                          new URLSearchParams(url.search).get('access_key')
    
    const finalApiKey = apiKey || possibleApiKey || ''
    console.log('Using API key:', finalApiKey ? 'yes (length: ' + finalApiKey.length + ')' : 'no')
    
    const response = await fetch(cleanRpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': finalApiKey,
        // Try alternative header names
        'api-key': finalApiKey,
        'apikey': finalApiKey,
        'key': finalApiKey,
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