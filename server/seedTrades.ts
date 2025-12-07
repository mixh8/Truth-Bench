import { db } from "./db";
import { marketEvents } from "@shared/schema";
import { STATIC_TRADES } from "./staticTrades";
import { sql } from "drizzle-orm";

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function seedTrades(retries = 5): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`[Seed] Attempt ${attempt}/${retries}: Checking database...`);
      
      const countResult = await db.select({ count: sql<number>`count(*)` }).from(marketEvents);
      const existingCount = Number(countResult[0]?.count || 0);
      
      console.log(`[Seed] Found ${existingCount} existing trades`);
      
      if (existingCount === 100) {
        console.log("[Seed] Database already has exactly 100 trades. Done.");
        return;
      }

      console.log("[Seed] Clearing and inserting 100 static trades...");
      
      await db.delete(marketEvents);
      
      const baseTime = Date.now() - 100 * 60 * 1000;
      const trades = STATIC_TRADES.map((trade, i) => ({
        modelId: trade.modelId,
        market: trade.market,
        action: trade.action,
        comment: trade.comment,
        timestamp: new Date(baseTime + i * 60 * 1000),
      }));

      await db.insert(marketEvents).values(trades);
      console.log("[Seed] Successfully inserted 100 static trades!");
      return;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Seed] Attempt ${attempt} failed:`, errorMessage);
      
      if (attempt < retries) {
        const waitTime = attempt * 2000;
        console.log(`[Seed] Waiting ${waitTime}ms before retry...`);
        await delay(waitTime);
      } else {
        console.error("[Seed] All retry attempts exhausted.");
        throw error;
      }
    }
  }
}
