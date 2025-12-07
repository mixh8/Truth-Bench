import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import { insertMarketEventSchema, insertModelSchema } from "@shared/schema";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Create or update a model
  app.post("/api/models", async (req, res) => {
    try {
      const validated = insertModelSchema.parse(req.body);
      const model = await storage.createOrUpdateModel(validated);
      res.status(201).json(model);
    } catch (error) {
      console.error("Error creating model:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to create model" });
    }
  });

  // Get all models with their current state
  app.get("/api/models", async (req, res) => {
    try {
      const allModels = await storage.getAllModels();
      res.json(allModels);
    } catch (error) {
      console.error("Error fetching models:", error);
      res.status(500).json({ error: "Failed to fetch models" });
    }
  });

  // Get single model
  app.get("/api/models/:id", async (req, res) => {
    try {
      const model = await storage.getModel(req.params.id);
      if (!model) {
        return res.status(404).json({ error: "Model not found" });
      }
      res.json(model);
    } catch (error) {
      console.error("Error fetching model:", error);
      res.status(500).json({ error: "Failed to fetch model" });
    }
  });

  // Update model state (current value and history)
  app.patch("/api/models/:id", async (req, res) => {
    try {
      const { currentValue, history } = req.body;
      const updated = await storage.updateModel(req.params.id, {
        currentValue,
        history: history || undefined,
      });
      res.json(updated);
    } catch (error) {
      console.error("Error updating model:", error);
      res.status(500).json({ error: "Failed to update model" });
    }
  });

  // Get recent market events
  app.get("/api/events", async (req, res) => {
    try {
      const count = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const events = await storage.getRecentEvents(count);
      res.json(events);
    } catch (error) {
      console.error("Error fetching events:", error);
      res.status(500).json({ error: "Failed to fetch events" });
    }
  });

  // Create a market event
  app.post("/api/events", async (req, res) => {
    try {
      const validated = insertMarketEventSchema.parse(req.body);
      const event = await storage.createEvent(validated);
      res.status(201).json(event);
    } catch (error) {
      console.error("Error creating event:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to create event" });
    }
  });

  // Get market state
  app.get("/api/market-state", async (req, res) => {
    try {
      const state = await storage.getMarketState();
      res.json(state);
    } catch (error) {
      console.error("Error fetching market state:", error);
      res.status(500).json({ error: "Failed to fetch market state" });
    }
  });

  // Update market state (total volume, playing state)
  app.patch("/api/market-state", async (req, res) => {
    try {
      const { totalVolume, isPlaying } = req.body;
      const updated = await storage.updateMarketState({
        totalVolume,
        isPlaying,
      });
      res.json(updated);
    } catch (error) {
      console.error("Error updating market state:", error);
      res.status(500).json({ error: "Failed to update market state" });
    }
  });

  return httpServer;
}
