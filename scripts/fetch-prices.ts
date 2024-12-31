import axios from 'axios';

const TOKENS = {
    CHAOS: '8SgNwESovnbG1oNEaPVhg6CR9mTMSK7jPvcYRe3wpump',
    LOGOS: 'HJUfqXoYjC653f2p33i84zdCC3jc4EuVnbruSe5kpump'
} as const;

interface QuoteResponse {
    outAmount: number;
    // Add other fields if needed
}

async function getPrices(): Promise<void> {
    try {
        const { data: chaosData } = await axios.get<QuoteResponse>(
            `https://quote-api.jup.ag/v6/quote?inputMint=${TOKENS.CHAOS}&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&amount=1000000`
        );
        
        const { data: logosData } = await axios.get<QuoteResponse>(
            `https://quote-api.jup.ag/v6/quote?inputMint=${TOKENS.LOGOS}&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&amount=1000000`
        );
        
        console.log('\nCurrent Prices:');
        console.log('-------------');
        console.log(`CHAOS: $${(chaosData.outAmount / 1000000).toFixed(6)} USDC (per 1 CHAOS)`);
        console.log(`LOGOS: $${(logosData.outAmount / 1000000).toFixed(6)} USDC (per 1 LOGOS)`);
        console.log('-------------');
    } catch (error) {
        console.error('Error fetching prices:', error);
    }
}

// Execute the function
getPrices(); 