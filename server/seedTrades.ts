import { storage } from "./storage";
import { STATIC_TRADES } from "./staticTrades";

/**
 * Seed trades into in-memory storage.
 * This is a no-op for demo purposes since we use real-time LLM trading.
 */
export async function seedTrades(): Promise<void> {
  console.log("[Seed] Using in-memory storage - seeding static trades...");
  
  for (const trade of STATIC_TRADES) {
    await storage.createEvent({
      modelId: trade.modelId,
      market: trade.market,
      action: trade.action,
      comment: trade.comment,
    });
  }
  
  const count = await storage.getEventCount();
  console.log(`[Seed] Successfully seeded ${count} trades into memory!`);
}
