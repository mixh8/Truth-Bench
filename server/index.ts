import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { initializePortfolios, runTradingCycle, updatePortfolioValues } from "./tradingSimulation";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
    },
    async () => {
      log(`serving on port ${port}`);
      
      // Initialize trading portfolios
      await initializePortfolios();
      
      const isSimulated = process.env.USE_SIMULATED_TRADING === 'true';
      
      log('====================================');
      log(`🚀 ${isSimulated ? 'SIMULATED' : 'LIVE'} TRADING SIMULATION STARTED`);
      log('====================================');
      log(`📊 Trading Cycle: Every ${isSimulated ? '10 seconds' : '10 minutes'}`);
      log('💰 Portfolio Mark-to-Market: Every 10 seconds');
      log('🤖 Models: 5 (grok_heavy_x, grok_heavy, gpt_5, claude_opus, gemini_pro)');
      log('📈 Initial Capital: $10,000 per model');
      log(`⚡ First trade cycle in ${isSimulated ? '5' : '10'} seconds...`);
      if (isSimulated) {
        log('⚠️  SIMULATED MODE: Random walk updates (set USE_SIMULATED_TRADING=false for real trading)');
      }
      log('====================================');
      
      // Run initial trading cycle after a short delay
      const initialDelay = isSimulated ? 5000 : 10000;
      setTimeout(() => {
        log('⏰ Running INITIAL trading cycle...');
        runTradingCycle().catch(err => console.error('[Trading] Cycle error:', err));
      }, initialDelay);
      
      // Run trading cycle - every 10 seconds in simulated mode, every 10 minutes in real mode
      const tradingInterval = isSimulated ? 10 * 1000 : 10 * 60 * 1000;
      setInterval(() => {
        log('⏰ Running SCHEDULED trading cycle...');
        runTradingCycle().catch(err => console.error('[Trading] Cycle error:', err));
      }, tradingInterval);
      
      // Update portfolio values every 10 seconds for smooth UI updates
      setInterval(() => {
        updatePortfolioValues().catch(err => console.error('[Trading] Portfolio update error:', err));
      }, 10 * 1000);
    },
  );
})();
