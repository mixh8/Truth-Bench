import {
  type User,
  type InsertUser,
  type Model,
  type InsertModel,
  type MarketEvent,
  type InsertMarketEvent,
  type MarketState,
  type InsertMarketState,
} from "@shared/schema";

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
  getAllEventsOrdered(): Promise<MarketEvent[]>;
  getEventCount(): Promise<number>;

  // Market state operations
  getMarketState(): Promise<MarketState | undefined>;
  updateMarketState(state: Partial<InsertMarketState>): Promise<MarketState>;
}

/**
 * In-memory storage implementation for TruthBench demo.
 * No database required - data persists only during server runtime.
 */
export class InMemoryStorage implements IStorage {
  private users: Map<string, User> = new Map();
  private models: Map<string, Model> = new Map();
  private events: MarketEvent[] = [];
  private state: MarketState | undefined;
  private eventIdCounter = 1;

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(u => u.username === username);
  }

  async createUser(user: InsertUser): Promise<User> {
    const id = crypto.randomUUID();
    const newUser: User = {
      id,
      username: user.username,
      password: user.password,
    };
    this.users.set(newUser.id, newUser);
    return newUser;
  }

  async getModel(id: string): Promise<Model | undefined> {
    return this.models.get(id);
  }

  async getAllModels(): Promise<Model[]> {
    return Array.from(this.models.values());
  }

  async updateModel(id: string, updates: Partial<Model>): Promise<Model | undefined> {
    const existing = this.models.get(id);
    if (!existing) return undefined;

    const updated: Model = {
      ...existing,
      ...updates,
      updatedAt: new Date(),
    };
    this.models.set(id, updated);
    return updated;
  }

  async createOrUpdateModel(model: InsertModel): Promise<Model> {
    const existing = await this.getModel(model.id);
    if (existing) {
      return this.updateModel(model.id, model) as Promise<Model>;
    }

    const newModel: Model = {
      id: model.id,
      name: model.name,
      color: model.color,
      avatar: model.avatar,
      description: model.description,
      riskFactor: model.riskFactor,
      currentValue: model.currentValue ?? 10000,
      history: model.history ?? [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.models.set(newModel.id, newModel);
    return newModel;
  }

  async createEvent(event: InsertMarketEvent): Promise<MarketEvent> {
    const newEvent: MarketEvent = {
      id: `event_${this.eventIdCounter++}`,
      modelId: event.modelId,
      action: event.action,
      market: event.market,
      marketUrl: event.marketUrl ?? null,
      comment: event.comment,
      profit: event.profit ?? null,
      timestamp: new Date(),
    };
    this.events.push(newEvent);
    return newEvent;
  }

  async getRecentEvents(count: number): Promise<MarketEvent[]> {
    return [...this.events]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, count);
  }

  async getAllEventsOrdered(): Promise<MarketEvent[]> {
    return [...this.events]
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  async getEventCount(): Promise<number> {
    return this.events.length;
  }

  async getMarketState(): Promise<MarketState | undefined> {
    return this.state;
  }

  async updateMarketState(state: Partial<InsertMarketState>): Promise<MarketState> {
    if (!this.state) {
      this.state = {
        id: "default_state",
        totalVolume: state.totalVolume ?? 1200000,
        isPlaying: state.isPlaying ?? 1,
        lastUpdated: new Date(),
      };
    } else {
      this.state = {
        ...this.state,
        ...state,
        lastUpdated: new Date(),
      };
    }
    return this.state;
  }
}

// Use in-memory storage (no database required)
export const storage = new InMemoryStorage();
