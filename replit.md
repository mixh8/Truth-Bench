# Truth Bench - AI Prediction Market Simulator

## Overview

Truth Bench is a real-time simulation dashboard that benchmarks the trading performance of 5 different AI models (Grok, Claude, GPT-5, DeepSeek, Gemini) in a simulated prediction market environment. The application provides a professional trading interface that displays live portfolio values, market events, and reasoning logs from AI trading agents competing against each other starting with $10,000 each.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework & Build System:**
- React 18+ with TypeScript for type-safe component development
- Vite as the build tool and development server, configured to serve from the `client` directory
- Wouter for lightweight client-side routing
- TailwindCSS v4 for styling with custom theme variables defined in `index.css`

**UI Component Strategy:**
- shadcn/ui component library (Radix UI primitives) for consistent, accessible UI elements
- Custom components in `client/src/components/dashboard/` for domain-specific features (Ticker, Leaderboard, PerformanceChart, ReasoningFeed)
- Dark mode support via ThemeProvider with system preference detection
- Monospace fonts (JetBrains Mono) for terminal-style reasoning feed

**State Management & Data Fetching:**
- TanStack Query (React Query) for server state management, data fetching, and caching
- Custom `useSimulation` hook centralizes simulation logic and polling
- Query client configured with infinite stale time and disabled refetching by default (controlled polling instead)
- Real-time updates achieved through periodic polling of backend endpoints

**Data Visualization:**
- Recharts for line charts showing portfolio value over time
- Custom tooltips with model icons and sorted values
- Framer Motion for animated event feed with enter/exit animations
- Custom color scheme per AI model defined in CSS variables

### Backend Architecture

**Server Framework:**
- Express.js HTTP server with TypeScript
- HTTP server created via Node's `createServer` for potential WebSocket upgrades
- Middleware: JSON body parsing with raw body preservation, URL-encoded parsing
- Custom logging middleware for request/response tracking

**API Design:**
- RESTful endpoints under `/api` namespace
- GET `/api/events/all` - Returns all market events ordered by timestamp
- POST `/api/models` - Creates or updates model state
- GET `/api/models` - Retrieves all models with current portfolio values
- Static file serving for production builds via Express static middleware
- SPA fallback routing (all routes serve index.html)

**Simulation Engine:**
- `seedTrades.ts` generates mock market events on server startup
- Randomized but trend-based outcomes for each AI model
- Configurable risk factors per model (stored in database)
- Market events include: market name, action (Buy/Sell/Hold), comment, profit, timestamp
- Frontend polls events and cycles through them for "live" appearance

**Development Environment:**
- Vite development server in middleware mode for HMR
- Separate dev scripts for client and server
- Source maps enabled for debugging
- Custom Vite plugins for Replit integration (cartographer, dev banner, meta images)

### Data Storage

**Database & ORM:**
- PostgreSQL as the primary database (required via `DATABASE_URL` environment variable)
- Drizzle ORM for type-safe database access and schema definition
- Schema defined in `shared/schema.ts` for code sharing between client and server
- Connection via postgres-js driver

**Database Schema:**

1. **users table:**
   - id (UUID, primary key)
   - username (text, unique)
   - password (text)
   - Currently defined but not actively used in simulation

2. **models table:**
   - id (varchar, primary key) - Model identifier (e.g., 'grok_heavy_x')
   - name (text) - Display name
   - color (text) - CSS color value for charts
   - avatar (text) - Emoji/icon representation
   - currentValue (real) - Current portfolio value
   - riskFactor (real) - Volatility/trading aggressiveness
   - description (text) - Model description
   - history (jsonb) - Array of {time, value} datapoints for charts
   - createdAt, updatedAt (timestamps)

3. **marketEvents table:**
   - id (UUID, primary key)
   - modelId (varchar) - References models
   - market (text) - Market name (e.g., "NVDA Breakout")
   - action (text) - 'Buy', 'Sell', or 'Hold'
   - comment (text) - Model's reasoning/thought
   - profit (real, optional) - P&L from the trade
   - timestamp (timestamp)

4. **marketState table:**
   - Tracks global market state and sentiment
   - Defined but implementation details minimal in provided code

**Data Validation:**
- Zod schemas generated from Drizzle schema via drizzle-zod
- Runtime validation on API endpoints
- Type inference ensures client/server type safety

**Storage Layer:**
- IStorage interface defines storage contract
- PGStorage implementation provides PostgreSQL-backed operations
- Methods for CRUD operations on users, models, events, and market state
- Exports singleton `storage` instance

### External Dependencies

**Third-Party Services:**
- None currently active (authentication scaffolding present but unused)
- No external API integrations
- No payment processing (Stripe dependency present but not implemented)

**Build Dependencies:**
- esbuild for server bundling in production
- Vite for client bundling
- Build script bundles allowlisted dependencies to reduce syscalls for faster cold starts

**UI Libraries:**
- Radix UI component primitives (@radix-ui/react-*)
- Lucide React for icons
- Recharts for data visualization
- embla-carousel-react for carousel functionality
- date-fns for date formatting
- framer-motion for animations

**Development Tools:**
- TypeScript for static typing
- Replit-specific Vite plugins for development experience
- PostCSS with Autoprefixer for CSS processing

**Session Management:**
- express-session dependency present
- connect-pg-simple for PostgreSQL session store
- memorystore as alternative
- Currently unused in simulation (no authentication flow)

**Fonts:**
- Google Fonts: Inter (sans-serif) and JetBrains Mono (monospace)
- Loaded via CDN in index.html