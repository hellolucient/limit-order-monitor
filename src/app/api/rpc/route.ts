import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL

  if (!rpcUrl) {
    console.error('NEXT_PUBLIC_RPC_URL not set for proxy')
    return NextResponse.json({ error: 'RPC URL not configured' }, { status: 500 })
  }

  try {
    const requestBody = await request.json()
    console.log('Proxying RPC request to:', rpcUrl)
    // console.log('Request body:', JSON.stringify(requestBody)); // Uncomment for deep debugging

    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Forward any necessary headers, like potential API keys if included in the rpcUrl query params
        // If the API key is part of the URL, it's handled automatically by fetch.
      },
      body: JSON.stringify(requestBody),
    })

    if (!res.ok) {
      const errorBody = await res.text()
      console.error('RPC proxy error:', res.status, errorBody)
      return NextResponse.json({ error: `Upstream RPC error: ${res.status}` }, { status: res.status })
    }

    const data = await res.json()
    // console.log('RPC proxy response:', data); // Uncomment for deep debugging
    return NextResponse.json(data)

  } catch (error) {
    console.error('Error in RPC proxy route:', error)
    return NextResponse.json({ error: 'Internal server error in proxy' }, { status: 500 })
  }
} 