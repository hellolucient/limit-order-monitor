import { NextResponse } from 'next/server'
import { Connection, PublicKey } from '@solana/web3.js'

interface OffChainMetadata {
  image?: string
  logoURI?: string
  [key: string]: any
}

// Metaplex Token Metadata Program ID
const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s')

// Get RPC URL
function getRpcUrl(): string {
  if (process.env.NEXT_PUBLIC_RPC_URL) {
    return process.env.NEXT_PUBLIC_RPC_URL
  }
  return 'https://api.mainnet-beta.solana.com'
}

// Find metadata PDA
function findMetadataPDA(mint: PublicKey): PublicKey {
  const [metadataPDA] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('metadata'),
      METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
    ],
    METADATA_PROGRAM_ID
  )
  return metadataPDA
}

// Deserialize metadata account
function deserializeMetadata(buffer: Buffer): {
  name: string
  symbol: string
  uri: string
  sellerFeeBasisPoints: number
} | null {
  try {
    // Skip the first 1 byte (key) and next 32 bytes (update authority)
    let offset = 1 + 32
    
    // Read mint (32 bytes)
    offset += 32
    
    // Read name (4 bytes length + string)
    const nameLength = buffer.readUInt32LE(offset)
    offset += 4
    const name = buffer.slice(offset, offset + nameLength).toString('utf8').replace(/\0/g, '').trim()
    offset += nameLength
    
    // Read symbol (4 bytes length + string)
    const symbolLength = buffer.readUInt32LE(offset)
    offset += 4
    const symbol = buffer.slice(offset, offset + symbolLength).toString('utf8').replace(/\0/g, '').trim()
    offset += symbolLength
    
    // Read URI (4 bytes length + string)
    const uriLength = buffer.readUInt32LE(offset)
    offset += 4
    const uri = buffer.slice(offset, offset + uriLength).toString('utf8').replace(/\0/g, '').trim()
    offset += uriLength
    
    // Read seller fee basis points (2 bytes)
    const sellerFeeBasisPoints = buffer.readUInt16LE(offset)
    
    return { name, symbol, uri, sellerFeeBasisPoints }
  } catch (error) {
    console.error('Error deserializing metadata:', error)
    return null
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const mintAddress = searchParams.get('mintAddress')

  if (!mintAddress) {
    return NextResponse.json(
      { error: 'Missing mintAddress parameter' },
      { status: 400 }
    )
  }

  try {
    // Validate the mint address
    let mintPubkey: PublicKey
    try {
      mintPubkey = new PublicKey(mintAddress)
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid mint address' },
        { status: 400 }
      )
    }

    // Create connection
    const connection = new Connection(getRpcUrl(), 'confirmed')

    // Find the metadata PDA
    const metadataPDA = findMetadataPDA(mintPubkey)

    // Fetch the metadata account
    const metadataAccount = await connection.getAccountInfo(metadataPDA)
    
    if (!metadataAccount) {
      return NextResponse.json(
        { error: 'Token metadata not found on-chain' },
        { status: 404 }
      )
    }

    // Deserialize the metadata
    const metadata = deserializeMetadata(metadataAccount.data)
    
    if (!metadata) {
      return NextResponse.json(
        { error: 'Failed to parse metadata' },
        { status: 500 }
      )
    }

    // Extract on-chain data
    const tokenInfo = {
      symbol: metadata.symbol,
      name: metadata.name,
      decimals: 9, // Default, we'll fetch from mint account
      logoURI: undefined as string | undefined,
      tags: [],
      mint_authority: undefined as string | undefined,
      address: mintAddress
    }

    // Try to get decimals and mint authority from mint account
    try {
      const mintInfo = await connection.getParsedAccountInfo(mintPubkey)
      if (mintInfo.value && 'parsed' in mintInfo.value) {
        const parsed = mintInfo.value.parsed as { type: string; info?: { decimals?: number; mintAuthority?: string | null } }
        if (parsed.type === 'mint' && parsed.info) {
          tokenInfo.decimals = parsed.info.decimals ?? 9
          tokenInfo.mint_authority = parsed.info.mintAuthority || undefined
        }
      }
    } catch (error) {
      // Use default decimals if we can't fetch
    }

    // Try to fetch off-chain metadata for logo/image
    if (metadata.uri) {
      try {
        const uri = metadata.uri.trim()
        if (uri && (uri.startsWith('http') || uri.startsWith('https'))) {
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 5000)
          
          const offChainResponse = await fetch(uri, {
            signal: controller.signal
          })
          
          clearTimeout(timeoutId)
          
          if (offChainResponse.ok) {
            const offChainData: OffChainMetadata = await offChainResponse.json()
            tokenInfo.logoURI = offChainData.image || offChainData.logoURI
          }
        }
      } catch (error) {
        // Silently fail - off-chain metadata is optional
      }
    }

    return NextResponse.json(tokenInfo)
  } catch (error: any) {
    console.error('Error fetching Metaplex metadata:', error.message)
    return NextResponse.json(
      { error: 'Failed to fetch token metadata', details: error.message },
      { status: 500 }
    )
  }
}
