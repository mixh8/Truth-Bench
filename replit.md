# Truth Bench - AI Prediction Market Benchmark

## Overview

Truth Bench is a real-time prediction market simulator that benchmarks the trading performance of five different AI models (Grok, Claude, GPT, DeepSeek, and Gemini). The application provides a professional trading dashboard interface where users can watch AI models compete in simulated prediction markets, displaying live performance metrics, reasoning logs, and comparative analytics.

The application simulates trading rounds where each AI model starts with $10,000 and makes trading decisions on various prediction markets. The system tracks portfolio values over time, generates reasoning commentary, and displays comprehensive performance visualizations.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework & Routing**: React with TypeScript using Wouter for client-side routing. The application is a single-page application (SPA) with a primary dashboard view.

**UI Component System**: Built on Radix UI primitives with shadcn/ui components, styled using Tailwind CSS v4 with the "new-york" theme variant. The design system uses CSS custom properties for theming with dark mode support via a theme provider context.

**State Management**: 
- TanStack Query (React Query) handles server state management with custom query functions
- Local state management through React hooks
- Custom simulation hook (`useSimulation`) manages the core trading simulation logic
- Theme state managed through a dedicated ThemeProvider context

**Real-time Simulation**: The simulation engine runs client-side with configurable intervals, updating model portfolio values and generating market events. Historical data is maintained as JSON arrays within model records, enabling time-series charting without complex data transformations.

**Data Visualization**: Recharts library provides line charts for performance tracking with custom tooltips showing real-time portfolio values. The chart displays multiple AI models simultaneously with color-coded series.

### Backend Architecture

**Server Framework**: Express.js running on Node.js with TypeScript. The server follows a modular architecture separating concerns between routing, data access, and static file serving.

**Development vs Production**: 
- Development mode uses Vite middleware for hot module replacement (HMR) and instant feedback
- Production builds compile both client (via Vite) and server (via esbuild) into optimized bundles
- Custom build script allows selective bundling of dependencies to reduce cold start times

**API Design**: RESTful endpoints for model and market event management:
- `POST /api/models` - Create or update model state
- `GET /api/models` - Retrieve all models with current state
- `GET /api/models/:id` - Retrieve individual model
- `POST /api/events` - Create market events
- Market state tracking via dedicated endpoints

**Storage Abstraction**: Interface-based storage layer (`IStorage`) enables swapping between different persistence mechanisms. Currently implements PostgreSQL storage but designed for flexibility.

### Data Storage

**Database**: PostgreSQL accessed through Drizzle ORM with type-safe schema definitions. Database migrations managed via drizzle-kit.

**Schema Design**:
- **users** table: Basic authentication structure (id, username, password)
- **models** table: Stores AI model configuration and state including:
  - Model metadata (id, name, color, avatar, description)
  - Financial state (currentValue, riskFactor)
  - Historical performance data (JSONB array of time-series values)
  - Timestamps for tracking updates
- **marketEvents** table: Logs individual trading actions and reasoning with model references, market names, actions (Buy/Sell/Hold), commentary, and profit tracking
- **marketState** table: Maintains global market state and configuration

**Data Modeling Strategy**: Historical performance data stored as JSONB arrays rather than separate time-series tables, optimizing for read performance and simplifying chart data preparation. This trade-off favors query simplicity over write normalization.

### External Dependencies

**UI Libraries**:
- Radix UI component primitives for accessible, unstyled UI components
- Lucide React for iconography
- Recharts for data visualization
- Framer Motion for animations
- Embla Carousel for carousel functionality

**Build Tools**:
- Vite for frontend bundling and development server
- esbuild for server-side bundling
- Tailwind CSS v4 via Vite plugin
- PostCSS for CSS processing

**Database & ORM**:
- PostgreSQL as primary data store
- Drizzle ORM for type-safe database access
- postgres.js as PostgreSQL client
- drizzle-zod for schema validation

**Development Tools**:
- Replit-specific plugins for enhanced development experience (cartographer, dev banner, runtime error overlay)
- Custom Vite plugin for meta image management
- TypeScript for type safety across the stack

**Utilities**:
- Zod for runtime validation
- date-fns for date manipulation
- clsx and tailwind-merge for conditional styling
- nanoid for unique ID generation

**Session Management**: Infrastructure includes express-session and connect-pg-simple for PostgreSQL-backed sessions, though authentication may not be fully implemented in current scope.