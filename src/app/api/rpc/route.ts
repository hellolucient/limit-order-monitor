import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL
  if (!rpcUrl) {
    return new NextResponse('RPC URL not configured', { status: 500 })
  }

  try {
    const body = await request.json()
    
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body)
    })

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('RPC proxy error:', error)
    return new NextResponse('RPC request failed', { status: 500 })
  }
} 