import { NextResponse } from 'next/server'
import { Connection, PublicKey } from '@solana/web3.js'

interface OffChainMetadata {
  image?: string
  logoURI?: string
  [key: string]: any
}

// Metaplex Token Metadata Program ID
const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s')
// Token-2022 Program ID
const TOKEN_2022_PROGRAM_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb')

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

// Parse Token-2022 tokenMetadata extension from raw account buffer
// Token-2022 extensions are stored in TLV (Type-Length-Value) format after the base mint data
// We'll try to find the tokenMetadata extension by looking for the expected structure
function parseToken2022Metadata(buffer: Buffer): { name?: string; symbol?: string; uri?: string } | null {
  try {
    // Base mint account size is 82 bytes for Token-2022
    const BASE_MINT_SIZE = 82
    if (buffer.length < BASE_MINT_SIZE) {
      return null
    }
    
    // Try searching for metadata pattern directly in the buffer
    // TokenMetadata structure: updateAuthority (32 bytes) + mint (32 bytes) + name (4 bytes len + string) + symbol (4 bytes len + string) + uri (4 bytes len + string)
    // We'll search for patterns that look like this structure
    
    // Start searching from after the base mint account
    for (let startOffset = BASE_MINT_SIZE; startOffset < buffer.length - 64; startOffset++) {
      try {
        let offset = startOffset
        
        // Skip update authority (32 bytes) - can be anything
        offset += 32
        
        // Skip mint (32 bytes) - can be anything  
        offset += 32
        
        // Try to read name
        if (offset + 4 > buffer.length) continue
        const nameLength = buffer.readUInt32LE(offset)
        offset += 4
        
        // Validate name length
        if (nameLength === 0 || nameLength > 200 || offset + nameLength > buffer.length) continue
        
        const nameBytes = buffer.slice(offset, offset + nameLength)
        const name = nameBytes.toString('utf8').replace(/\0/g, '').trim()
        offset += nameLength
        
        // Validate name is readable
        if (name.length === 0 || name.length !== nameLength) continue
        
        // Try to read symbol
        if (offset + 4 > buffer.length) continue
        const symbolLength = buffer.readUInt32LE(offset)
        offset += 4
        
        // Validate symbol length
        if (symbolLength === 0 || symbolLength > 50 || offset + symbolLength > buffer.length) continue
        
        const symbolBytes = buffer.slice(offset, offset + symbolLength)
        const symbol = symbolBytes.toString('utf8').replace(/\0/g, '').trim()
        offset += symbolLength
        
        // Validate symbol is readable
        if (symbol.length === 0 || symbol.length !== symbolLength) continue
        
        // Try to read URI (optional)
        let uri: string | undefined = undefined
        if (offset + 4 <= buffer.length) {
          const uriLength = buffer.readUInt32LE(offset)
          offset += 4
          
          if (uriLength > 0 && uriLength < 5000 && offset + uriLength <= buffer.length) {
            const uriBytes = buffer.slice(offset, offset + uriLength)
            uri = uriBytes.toString('utf8').replace(/\0/g, '').trim()
          }
        }
        
        // If we found valid name and symbol, this is likely TokenMetadata
        if (name && symbol) {
          return { name, symbol, uri }
        }
      } catch (error) {
        // Continue searching
        continue
      }
    }
    
    return null
  } catch (error) {
    console.error('Error parsing Token-2022 metadata:', error)
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

    // Get mint account info (both parsed and raw)
    let decimals = 9 // Default
    let mintAuthority: string | undefined = undefined
    let tokenMetadataExtension: { name?: string; symbol?: string; uri?: string } | null = null
    
    try {
      const [mintInfo, rawAccount] = await Promise.all([
        connection.getParsedAccountInfo(mintPubkey),
        connection.getAccountInfo(mintPubkey)
      ])
      
      // Get decimals and mint authority from parsed account
      if (mintInfo.value && 'parsed' in mintInfo.value) {
        const parsed = mintInfo.value.parsed as any
        
        if (parsed.type === 'mint' && parsed.info) {
          decimals = parsed.info.decimals ?? 9
          mintAuthority = parsed.info.mintAuthority || undefined
          
          // Try to get extensions from parsed account (some RPC providers parse them)
          let extensions: any[] = []
          if (parsed.info.extensions) {
            extensions = parsed.info.extensions
          } else if (parsed.extensions) {
            extensions = parsed.extensions
          }
          
          // Look for tokenMetadata extension in parsed data
          for (const ext of extensions) {
            const extName = ext.extension || ext.type || ext.name
            if (extName === 'tokenMetadata' || extName === 'TokenMetadata') {
              const state = ext.state || ext.data || ext
              if (state) {
                const name = state.name || state.tokenName || (state as any).token_name
                const symbol = state.symbol || state.tokenSymbol || (state as any).token_symbol
                const uri = state.uri || state.tokenUri || (state as any).token_uri
                
                if (name || symbol) {
                  tokenMetadataExtension = { name: name || '', symbol: symbol || '', uri: uri || '' }
                  break
                }
              }
            }
          }
        }
      }
      
      // If parsed account didn't have extensions, try parsing raw buffer
      // This is especially important for Token-2022 mints
      if (!tokenMetadataExtension && rawAccount) {
        // Check if it's a Token-2022 mint
        if (rawAccount.owner.equals(TOKEN_2022_PROGRAM_ID)) {
          const parsedMetadata = parseToken2022Metadata(rawAccount.data)
          if (parsedMetadata) {
            tokenMetadataExtension = parsedMetadata
          }
        }
      }
    } catch (error) {
      console.error('Error parsing mint account:', error)
      // Use default decimals if we can't fetch
    }
    
    // If we found Token-2022 extension metadata, use it (prioritize over Metaplex)
    if (tokenMetadataExtension && tokenMetadataExtension.name && tokenMetadataExtension.symbol) {
      const tokenInfo = {
        symbol: tokenMetadataExtension.symbol,
        name: tokenMetadataExtension.name,
        decimals: decimals,
        logoURI: undefined as string | undefined,
        tags: [],
        mint_authority: mintAuthority,
        address: mintAddress
      }
      
      // Try to fetch off-chain metadata for logo/image
      if (tokenMetadataExtension.uri) {
        try {
          const uri = tokenMetadataExtension.uri.trim()
          if (uri && (uri.startsWith('http') || uri.startsWith('https') || uri.startsWith('ipfs'))) {
            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), 5000)
            
            // Handle IPFS URIs
            const fetchUri = uri.startsWith('ipfs://') 
              ? uri.replace('ipfs://', 'https://ipfs.io/ipfs/')
              : uri.startsWith('ipfs/')
              ? uri.replace('ipfs/', 'https://ipfs.io/ipfs/')
              : uri
            
            const offChainResponse = await fetch(fetchUri, {
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
    }
    
    // If no Token-2022 extension, try Metaplex metadata
    // Find the metadata PDA
    const metadataPDA = findMetadataPDA(mintPubkey)

    // Fetch the metadata account
    const metadataAccount = await connection.getAccountInfo(metadataPDA)
    
    // If no Metaplex metadata account exists, return basic info
    if (!metadataAccount) {
      return NextResponse.json({
        symbol: mintAddress.slice(0, 6) + '...',
        name: 'Unknown Token',
        decimals: decimals,
        logoURI: undefined,
        tags: [],
        mint_authority: mintAuthority,
        address: mintAddress
      })
    }

    // Deserialize the metadata
    const metadata = deserializeMetadata(metadataAccount.data)
    
    // If metadata exists but can't be parsed, still return basic info
    if (!metadata) {
      return NextResponse.json({
        symbol: mintAddress.slice(0, 6) + '...',
        name: 'Unknown Token',
        decimals: decimals,
        logoURI: undefined,
        tags: [],
        mint_authority: mintAuthority,
        address: mintAddress
      })
    }

    // Extract on-chain data
    const tokenInfo = {
      symbol: metadata.symbol,
      name: metadata.name,
      decimals: decimals, // Use decimals from mint account
      logoURI: undefined as string | undefined,
      tags: [],
      mint_authority: mintAuthority,
      address: mintAddress
    }

    // Try to fetch off-chain metadata for logo/image
    if (metadata.uri) {
      try {
        const uri = metadata.uri.trim()
        if (uri && (uri.startsWith('http') || uri.startsWith('https') || uri.startsWith('ipfs'))) {
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 5000)
          
          // Handle IPFS URIs
          const fetchUri = uri.startsWith('ipfs://') 
            ? uri.replace('ipfs://', 'https://ipfs.io/ipfs/')
            : uri.startsWith('ipfs/')
            ? uri.replace('ipfs/', 'https://ipfs.io/ipfs/')
            : uri
          
          const offChainResponse = await fetch(fetchUri, {
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
    console.error('Error fetching token metadata:', error.message)
    return NextResponse.json(
      { error: 'Failed to fetch token metadata', details: error.message },
      { status: 500 }
    )
  }
}
