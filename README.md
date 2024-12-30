# Jupiter Limit Order Tracker

A real-time dashboard for tracking CHAOS and LOGOS limit orders on Jupiter Protocol.

## Project Structure

### Core Components

src/components/
├── LimitOrderCard.tsx    # Renders individual limit orders
│   - Displays order type (BUY/SELL)
│   - Shows amount, price, total
│   - Converts prices to USDC
│   - Links to Solscan explorer
│
├── TokenSection.tsx      # Main token display section
│   - Shows token stats (volume, orders)
│   - Displays volume chart
│   - Lists buy/sell orders
│   - Handles order sorting
│
├── shared/
│   └── SortButton.tsx   # Order sorting control
│       - Amount sorting
│       - Price sorting
│       - Date sorting
│
└── charts/
    └── OrderBookChart.tsx  # Order book visualization

### Business Logic

src/lib/
├── client/
│   ├── index.ts               # Client exports
│   └── JupiterLimitOrdersAPI  # Jupiter integration
│       - Fetches limit orders from Jupiter
│       - Handles RPC rate limits
│       - Parses raw order data
│
├── hooks/
│   └── useLimitOrders.ts      # Data management hook
│       - Manages order state
│       - Handles auto-refresh
│       - Calculates summaries
│
├── services/
│   └── PriceService.ts        # Price conversion
│       - USDC price conversion
│       - Price caching
│       - Token price lookup
│
└── types/
    ├── index.ts               # Type exports
    ├── token.ts              
    │   - Token addresses (CHAOS/LOGOS)
    │   - Token decimals
    └── limitOrder.ts          # Order type definitions

### Key Files Explained

#### `src/components/LimitOrderCard.tsx`
The core display component for individual orders. Features:
- Color-coded order types (green for BUY, red for SELL)
- Smart price formatting (up to 12 decimals for small numbers)
- USDC price conversion with PriceService
- Timestamp formatting in UTC
- Direct Solscan links for order inspection
- Responsive layout with Tailwind CSS

#### `src/components/TokenSection.tsx`
Main section component for each token (CHAOS/LOGOS). Handles:
- Volume statistics display
- Buy/Sell order aggregation
- Chart integration with real-time data
- Order sorting and filtering logic
- Sticky header with current price
- Responsive grid layout

#### `src/lib/client/JupiterLimitOrdersAPI.ts`
Core API client for Jupiter Protocol:
- Fetches limit orders using getProgramAccounts
- Implements smart retry logic with exponential backoff
- Handles RPC rate limits with backup endpoints
- Parses raw order data into typed structures
- Batch processes orders for efficiency

#### `src/lib/hooks/useLimitOrders.ts`
Custom React hook for order management:
- Manages order state and loading states
- Implements auto-refresh functionality
- Calculates volume summaries
- Handles error states and recovery
- Provides refresh controls

#### `src/lib/services/PriceService.ts`
Price conversion and caching service:
- Singleton pattern for global price state
- USDC price conversion logic
- Token price caching to reduce RPC calls
- Fallback price handling
- Mock prices for development

#### `src/lib/types/token.ts`
Token configuration and types:

```typescript
export const TOKENS = {
  CHAOS: {
    address: 'CHAoS3vxjMHc7qgHF3QxEyMtY9myVhUwgw7Qk6Qx1Vw',
    symbol: 'CHAOS',
    decimals: 6
  },
  LOGOS: {
    address: 'LOGOS9s4uWxRgwH5qo4h5uFqZqQhad8RYXuGNhyMteF',
    symbol: 'LOGOS',
    decimals: 6
  }
}
```

## Setup & Installation

### Prerequisites
- Node.js 16+ 
- npm or yarn
- A Solana RPC URL (Helius recommended)

### Quick Start

1. Clone the repository:
```bash
git clone https://github.com/hellolucient/jupiter-limit-order-tracker.git
cd jupiter-limit-order-tracker
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment:
Create a `.env.local` file:
```env
# Primary RPC endpoint (Helius recommended)
NEXT_PUBLIC_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_API_KEY

# Backup RPC endpoint
RPC_ENDPOINT=https://api.mainnet-beta.solana.com
```

4. Start development server:
```bash
npm run dev
```

Visit `http://localhost:3000` to see the app.

### Available Scripts
```bash
# Development
npm run dev

# Production build
npm run build

# Start production server
npm start

# Linting
npm run lint
``` 

## Technical Details

### Architecture Overview

The app follows a layered architecture:
1. Data Layer: JupiterLimitOrdersAPI
2. State Management: React hooks
3. UI Components: React with Tailwind CSS
4. Services: Price conversion, data formatting

### Rate Limit Handling

The app implements a sophisticated rate limit strategy:
```typescript
// Constants for rate limit handling
const BASE_DELAY = 2000
const MAX_DELAY = 10000
const RATE_LIMIT_MULTIPLIER = 1.5

// Example retry logic
if (error.toString().includes('429')) {
  console.log('⚡ Switching to backup RPC...')
  currentConnection = new Connection(process.env.RPC_ENDPOINT || '')
  attempt--
  continue
}
```

### Data Flow

1. Order Fetching:
   - JupiterLimitOrdersAPI fetches raw data
   - Data is parsed into typed structures
   - Orders are batched for efficiency

2. State Management:
   ```typescript
   const { orders, summary, loading, error } = useLimitOrders(autoRefresh)
   ```

3. Price Conversion:
   ```typescript
   // Convert to USDC
   const priceInUsdc = await priceService.convertExecutionPrice(
     order.price,
     inputSymbol,
     outputSymbol
   )
   ```

4. UI Updates:
   - Auto-refresh every 30 seconds
   - Manual refresh option
   - Loading states for feedback

### Performance Optimizations

1. Data Fetching:
   - Batch processing orders
   - RPC failover for reliability
   - Token info caching

2. React Optimizations:
   - Memoized calculations
   - Efficient re-renders
   - Lazy loading where appropriate

3. Price Handling:
   - Price caching
   - Smart number formatting
   - Fallback price mechanisms

### Error Handling

The app implements comprehensive error handling:
```typescript
try {
  // API calls
} catch (err) {
  if (err instanceof Error) {
    throw err
  }
  throw new Error('Unknown error in operation')
} finally {
  setLoading(false)
}
``` 

## Development Guide

### Project Organization

```
src/
├── app/                    # Next.js app router
│   ├── globals.css        # Global styles
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Main dashboard
│
├── components/            # React components
│   ├── LimitOrderCard     # Order display
│   ├── TokenSection       # Token stats
│   ├── shared/           # Shared components
│   └── charts/           # Chart components
│
└── lib/                  # Core logic
    ├── client/           # API clients
    ├── hooks/            # React hooks
    ├── services/         # Services
    └── types/           # TypeScript types
```

### Development Workflow

1. **Local Development**
   ```bash
   # Start development server
   npm run dev
   
   # Watch for changes
   npm run dev -- --watch
   ```

2. **Testing Changes**
   - Use mock data during development
   - Test with both RPCs
   - Verify error handling
   - Check mobile responsiveness

3. **Code Style**
   ```bash
   # Run linting
   npm run lint
   
   # Fix auto-fixable issues
   npm run lint -- --fix
   ```

### Common Tasks

1. **Adding a New Feature**
   ```typescript
   // 1. Add types if needed
   interface NewFeature {
     // ...
   }

   // 2. Update API client
   class JupiterLimitOrdersAPI {
     async newFeature() {
       // ...
     }
   }

   // 3. Create/update components
   function NewComponent() {
     // ...
   }
   ```

2. **Modifying Order Display**
   - Update LimitOrderCard.tsx
   - Test with different order types
   - Verify price formatting
   - Check USDC conversion

3. **RPC Configuration**
   ```env
   # Primary RPC with higher rate limits
   NEXT_PUBLIC_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY

   # Backup RPC for failover
   RPC_ENDPOINT=https://api.mainnet-beta.solana.com
   ```

### Debugging Tips

1. **RPC Issues**
   ```typescript
   // Add debug logging
   console.log('🔄 Attempt ${attempt} using ${
     currentConnection === this.connection ? 'primary' : 'backup'
   } RPC')
   ```

2. **Price Conversion**
   ```typescript
   // Debug price calculations
   console.log({
     raw: order.price,
     usdc: priceInUsdc,
     total: totalUSDC
   })
   ```

3. **Component Rendering**
   ```typescript
   // Add React DevTools debugging
   useEffect(() => {
     console.log('TokenSection rendered with:', {
       orders: orders.length,
       summary,
       loading
     })
   }, [orders, summary, loading])
   ``` 
    
## Contributing

### Getting Started

1. **Fork & Clone**
   ```bash
   git clone https://github.com/YOUR_USERNAME/jupiter-limit-order-tracker.git
   cd jupiter-limit-order-tracker
   git remote add upstream https://github.com/hellolucient/jupiter-limit-order-tracker.git
   ```

2. **Create a Branch**
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/your-bug-fix
   ```

### Development Process

1. **Keep Updated**
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. **Make Changes**
   - Follow the existing code style
   - Add comments for complex logic
   - Update types as needed
   - Add tests if applicable

3. **Commit Changes**
   ```bash
   git add .
   git commit -m "feat: add new feature"
   # or
   git commit -m "fix: resolve issue with..."
   ```

### Pull Request Process

1. **Before Submitting**
   - Run tests: `npm test`
   - Run linting: `npm run lint`
   - Update documentation
   - Test with both RPCs

2. **Submit PR**
   - Clear description of changes
   - Link related issues
   - Add screenshots if UI changes
   - Tag maintainers for review

### Code Style Guide

1. **TypeScript**
   ```typescript
   // Use interfaces for objects
   interface OrderProps {
     order: LimitOrder
     onUpdate?: () => void
   }

   // Use type for unions/intersections
   type OrderStatus = 'open' | 'filled' | 'cancelled'
   ```

2. **React Components**
   ```typescript
   // Use functional components
   export function Component({ prop1, prop2 }: Props) {
     // State at the top
     const [state, setState] = useState()

     // Hooks next
     useEffect(() => {
       // ...
     }, [])

     // Helper functions
     const handleEvent = () => {
       // ...
     }

     // Return JSX
     return (
       <div>
         {/* JSX here */}
       </div>
     )
   }
   ```

3. **File Organization**
   ```
   components/
   ├── ComponentName/
   │   ├── index.tsx
   │   ├── styles.css (if needed)
   │   └── types.ts (if complex)
   ```

### Testing Guidelines

1. **Component Testing**
   ```typescript
   describe('LimitOrderCard', () => {
     it('displays order details correctly', () => {
       // Test implementation
     })
   })
   ```

2. **API Testing**
   ```typescript
   describe('JupiterLimitOrdersAPI', () => {
     it('handles rate limits correctly', async () => {
       // Test implementation
     })
   })
   ``` 
    
## Deployment

### Production Deployment

1. **Build the Application**
   ```bash
   # Install dependencies
   npm install

   # Create production build
   npm run build
   ```

2. **Environment Setup**
   Create a `.env.production` file:
   ```env
   NEXT_PUBLIC_RPC_URL=YOUR_PRODUCTION_RPC_URL
   RPC_ENDPOINT=YOUR_BACKUP_RPC_URL
   ```

3. **Vercel Deployment**
   - Connect your GitHub repository
   - Configure environment variables
   - Deploy with default settings

### Self-Hosting

1. **Server Requirements**
   - Node.js 16+
   - 1GB RAM minimum
   - Reliable RPC access

2. **Server Setup**
   ```bash
   # Install PM2 globally
   npm install -g pm2

   # Start the application
   pm2 start npm --name "jupiter-lo" -- start
   ```

3. **Nginx Configuration**
   ```nginx
   server {
     listen 80;
     server_name your-domain.com;

     location / {
       proxy_pass http://localhost:3000;
       proxy_http_version 1.1;
       proxy_set_header Upgrade $http_upgrade;
       proxy_set_header Connection 'upgrade';
       proxy_set_header Host $host;
       proxy_cache_bypass $http_upgrade;
     }
   }
   ```

### Monitoring

1. **Health Checks**
   ```typescript
   // Add to pages/api/health.ts
   export default function handler(req, res) {
     res.status(200).json({ 
       status: 'healthy',
       timestamp: new Date().toISOString()
     })
   }
   ```

2. **Performance Monitoring**
   ```typescript
   // Add timing logs
   console.time('fetch-orders')
   const orders = await api.getLimitOrders()
   console.timeEnd('fetch-orders')
   ```

3. **Error Tracking**
   ```typescript
   // Add error boundary
   class ErrorBoundary extends React.Component {
     componentDidCatch(error, errorInfo) {
       console.error('Application error:', error, errorInfo)
       // Send to error tracking service
     }
   }
   ```

### Backup & Recovery

1. **Data Persistence**
   ```typescript
   // Cache order data
   const cache = new Map<string, LimitOrder>()
   
   // Restore on startup
   if (localStorage.getItem('cached_orders')) {
     // ... restore cache
   }
   ```

2. **RPC Failover**
   ```typescript
   // Already implemented in JupiterLimitOrdersAPI
   if (error.toString().includes('429')) {
     currentConnection = new Connection(process.env.RPC_ENDPOINT)
   }
   ``` 
    