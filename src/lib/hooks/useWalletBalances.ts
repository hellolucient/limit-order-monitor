import { useEffect, useState, useCallback } from 'react'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'

export interface WalletBalances {
  sol: number | null
  tokens: Map<string, number> // token address -> balance
  loading: boolean
  error: Error | null
  refresh: () => Promise<void>
}

const NATIVE_SOL_MINT = 'So11111111111111111111111111111111111111112'

export function useWalletBalances(tokenAddresses: string[] = []): WalletBalances {
  const { publicKey } = useWallet()
  const { connection } = useConnection()
  const [solBalance, setSolBalance] = useState<number | null>(null)
  const [tokenBalances, setTokenBalances] = useState<Map<string, number>>(new Map())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const fetchBalances = useCallback(async () => {
    if (!publicKey || !connection) {
      setSolBalance(null)
      setTokenBalances(new Map())
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Fetch SOL balance
      const solBalanceLamports = await connection.getBalance(publicKey)
      setSolBalance(solBalanceLamports / 1e9) // Convert lamports to SOL

      // Fetch token balances using getParsedTokenAccountsByOwner
      const balances = new Map<string, number>()
      
      if (tokenAddresses.length > 0) {
        try {
          // Get all token accounts for the wallet
          const tokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
            programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ1DA')
          })

          // Create a map of mint -> balance
          const tokenMap = new Map<string, number>()
          tokenAccounts.value.forEach(account => {
            const parsedInfo = account.account.data.parsed.info
            const mint = parsedInfo.mint
            const amount = parsedInfo.tokenAmount.uiAmount || 0
            tokenMap.set(mint, amount)
          })

          // Set balances for requested tokens
          for (const tokenAddress of tokenAddresses) {
            balances.set(tokenAddress, tokenMap.get(tokenAddress) || 0)
          }
        } catch (err) {
          // If error, set all balances to 0
          for (const tokenAddress of tokenAddresses) {
            balances.set(tokenAddress, 0)
          }
        }
      }

      setTokenBalances(balances)
    } catch (err) {
      setError(err as Error)
      console.error('Error fetching balances:', err)
    } finally {
      setLoading(false)
    }
  }, [publicKey, connection, tokenAddresses])

  useEffect(() => {
    fetchBalances()
    
    // Refresh balances every 10 seconds
    const interval = setInterval(fetchBalances, 10000)
    return () => clearInterval(interval)
  }, [fetchBalances])

  return {
    sol: solBalance,
    tokens: tokenBalances,
    loading,
    error,
    refresh: fetchBalances
  }
}
