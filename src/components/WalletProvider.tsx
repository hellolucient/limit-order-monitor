'use client'

import React, { useMemo } from 'react'
import { ConnectionProvider, WalletProvider as SolanaWalletProvider } from '@solana/wallet-adapter-react'
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets'
import { clusterApiUrl } from '@solana/web3.js'

// Import wallet adapter CSS
import '@solana/wallet-adapter-react-ui/styles.css'

export function WalletProvider({ children }: { children: React.ReactNode }) {
  // Use mainnet
  const network = WalletAdapterNetwork.Mainnet
  const endpoint = useMemo(() => {
    // Use environment variable if available, otherwise use public RPC
    if (process.env.NEXT_PUBLIC_RPC_URL) {
      return process.env.NEXT_PUBLIC_RPC_URL
    }
    return clusterApiUrl(network)
  }, [network])

  const wallets = useMemo(
    () => {
      // Create wallet adapters with explicit configuration
      const phantom = new PhantomWalletAdapter()
      const solflare = new SolflareWalletAdapter()
      
      // Ensure we only return Solana wallets (filter out any that might have been auto-detected)
      const walletList = [phantom, solflare]
      
      // Remove any duplicates by name
      const seen = new Set<string>()
      return walletList.filter((wallet) => {
        if (seen.has(wallet.name)) {
          return false
        }
        seen.add(wallet.name)
        return true
      })
    },
    []
  )

  return (
    <ConnectionProvider endpoint={endpoint}>
      <SolanaWalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider featuredWallets={2}>
          {children}
        </WalletModalProvider>
      </SolanaWalletProvider>
    </ConnectionProvider>
  )
}
