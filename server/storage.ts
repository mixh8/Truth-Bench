import { 
  type User, 
  type InsertUser,
  type Model,
  type InsertModel,
  type MarketEvent,
  type InsertMarketEvent,
  type MarketState,
  type InsertMarketState,
  users,
  models,
  marketEvents,
  marketState
} from "@shared/schema";
import { eq, desc, sql } from "drizzle-orm";
import { db } from "./db";

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Model operations
  getModel(id: string): Promise<Model | undefined>;
  getAllModels(): Promise<Model[]>;
  updateModel(id: string, updates: Partial<Model>): Promise<Model | undefined>;
  createOrUpdateModel(model: InsertModel): Promise<Model>;
  
  // Market event operations
  createEvent(event: InsertMarketEvent): Promise<MarketEvent>;
  getRecentEvents(count: number): Promise<MarketEvent[]>;
  getRandomEvents(count: number): Promise<MarketEvent[]>;
  countEvents(): Promise<number>;
  
  // Market state operations
  getMarketState(): Promise<MarketState | undefined>;
  updateMarketState(state: Partial<InsertMarketState>): Promise<MarketState>;
}

export class PGStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
    return result[0];
  }

  async createUser(user: InsertUser): Promise<User> {
    const result = await db.insert(users).values(user).returning();
    return result[0];
  }

  async getModel(id: string): Promise<Model | undefined> {
    const result = await db.select().from(models).where(eq(models.id, id)).limit(1);
    return result[0];
  }

  async getAllModels(): Promise<Model[]> {
    return db.select().from(models);
  }

  async updateModel(id: string, updates: Partial<Model>): Promise<Model | undefined> {
    const result = await db
      .update(models)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(models.id, id))
      .returning();
    return result[0];
  }

  async createOrUpdateModel(model: InsertModel): Promise<Model> {
    const existing = await this.getModel(model.id);
    if (existing) {
      return this.updateModel(model.id, model) as Promise<Model>;
    }
    const result = await db.insert(models).values(model).returning();
    return result[0];
  }

  async createEvent(event: InsertMarketEvent): Promise<MarketEvent> {
    const result = await db.insert(marketEvents).values(event).returning();
    return result[0];
  }

  async getRecentEvents(count: number): Promise<MarketEvent[]> {
    return db
      .select()
      .from(marketEvents)
      .orderBy(desc(marketEvents.timestamp))
      .limit(count);
  }

  async getRandomEvents(count: number): Promise<MarketEvent[]> {
    return db
      .select()
      .from(marketEvents)
      .orderBy(sql`RANDOM()`)
      .limit(count);
  }

  async countEvents(): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` }).from(marketEvents);
    return Number(result[0]?.count ?? 0);
  }

  async getMarketState(): Promise<MarketState | undefined> {
    const result = await db.select().from(marketState).limit(1);
    return result[0];
  }

  async updateMarketState(state: Partial<InsertMarketState>): Promise<MarketState> {
    const existing = await this.getMarketState();
    
    if (!existing) {
      const result = await db
        .insert(marketState)
        .values({
          totalVolume: state.totalVolume ?? 1200000,
          isPlaying: state.isPlaying ?? 1,
        })
        .returning();
      return result[0];
    }

    const result = await db
      .update(marketState)
      .set({
        ...state,
        lastUpdated: new Date(),
      })
      .where(eq(marketState.id, existing.id))
      .returning();
    return result[0];
  }
}

export const storage = new PGStorage();
