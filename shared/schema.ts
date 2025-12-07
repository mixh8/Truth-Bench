import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, real, jsonb, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const models = pgTable("models", {
  id: varchar("id").primaryKey(),
  name: text("name").notNull(),
  color: text("color").notNull(),
  avatar: text("avatar").notNull(),
  currentValue: real("current_value").notNull().default(10000),
  riskFactor: real("risk_factor").notNull(),
  description: text("description").notNull(),
  history: jsonb("history").notNull().default(sql`'[]'::jsonb`),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

export const insertModelSchema = createInsertSchema(models).omit({ 
  createdAt: true, 
  updatedAt: true 
});
export type InsertModel = z.infer<typeof insertModelSchema>;
export type Model = typeof models.$inferSelect;

export const marketEvents = pgTable("market_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  modelId: varchar("model_id").notNull(),
  market: text("market").notNull(),
  action: text("action").notNull(), // 'Buy', 'Sell', 'Hold'
  comment: text("comment").notNull(),
  profit: real("profit"),
  timestamp: timestamp("timestamp").notNull().default(sql`now()`),
});

export const insertMarketEventSchema = createInsertSchema(marketEvents).omit({ 
  id: true,
  timestamp: true
});
export type InsertMarketEvent = z.infer<typeof insertMarketEventSchema>;
export type MarketEvent = typeof marketEvents.$inferSelect;

export const marketState = pgTable("market_state", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  totalVolume: real("total_volume").notNull().default(1200000),
  isPlaying: integer("is_playing").notNull().default(1),
  lastUpdated: timestamp("last_updated").notNull().default(sql`now()`),
});

export const insertMarketStateSchema = createInsertSchema(marketState).omit({
  id: true,
  lastUpdated: true
});
export type InsertMarketState = z.infer<typeof insertMarketStateSchema>;
export type MarketState = typeof marketState.$inferSelect;
