import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { gmailService } from "./services/gmailService";
import { openaiService } from "./services/openaiService";
import { emailProcessor } from "./services/emailProcessor";
import {
  insertUserCredentialsSchema,
  insertEmailLogSchema,
  insertActivitySchema,
} from "./shared/schema";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // User credentials routes
  app.get('/api/credentials', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const credentials = await storage.getUserCredentials(userId);
      
      // Don't send sensitive tokens to frontend
      if (credentials) {
        const safeCredentials = {
          ...credentials,
          openaiApiKey: credentials.openaiApiKey ? '***' : null,
          gmailAccessToken: credentials.gmailAccessToken ? 'connected' : null,
          gmailRefreshToken: undefined,
        };
        res.json(safeCredentials);
      } else {
        res.json(null);
      }
    } catch (error) {
      console.error("Error fetching credentials:", error);
      res.status(500).json({ message: "Failed to fetch credentials" });
    }
  });

  app.post('/api/credentials', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const credentialsData = insertUserCredentialsSchema.parse({
        ...req.body,
        userId,
      });
      
      const credentials = await storage.upsertUserCredentials(credentialsData);
      res.json({ message: "Credentials updated successfully" });
    } catch (error) {
      console.error("Error updating credentials:", error);
      res.status(500).json({ message: "Failed to update credentials" });
    }
  });

  // Gmail OAuth routes
  app.get('/api/gmail/auth', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const authUrl = await gmailService.getAuthUrl(userId);
      res.json({ authUrl });
    } catch (error) {
      console.error("Error generating Gmail auth URL:", error);
      res.status(500).json({ message: "Failed to generate auth URL" });
    }
  });

  app.get('/api/gmail/callback', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { code } = req.query;
      
      if (!code) {
        return res.status(400).json({ message: "Authorization code required" });
      }

      await gmailService.handleCallback(userId, code as string);
      
      // Log activity
      await storage.insertActivity({
        userId,
        type: 'gmail_connected',
        description: 'Gmail account connected successfully',
      });

      res.redirect('/?gmail=connected');
    } catch (error) {
      console.error("Error handling Gmail callback:", error);
      res.status(500).json({ message: "Failed to connect Gmail" });
    }
  });

  // Agent control routes
  app.post('/api/agent/start', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const credentials = await storage.getUserCredentials(userId);
      
      if (!credentials?.openaiApiKey || !credentials?.gmailAccessToken) {
        return res.status(400).json({ 
          message: "Please configure OpenAI API key and Gmail access first" 
        });
      }

      await storage.upsertUserCredentials({
        userId,
        agentActive: true,
      });

      // Log activity
      await storage.insertActivity({
        userId,
        type: 'agent_start',
        description: 'Email agent started successfully',
      });

      // Start email monitoring
      emailProcessor.startMonitoring(userId);

      res.json({ message: "Agent started successfully" });
    } catch (error) {
      console.error("Error starting agent:", error);
      res.status(500).json({ message: "Failed to start agent" });
    }
  });

  app.post('/api/agent/stop', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      await storage.upsertUserCredentials({
        userId,
        agentActive: false,
      });

      // Log activity
      await storage.insertActivity({
        userId,
        type: 'agent_stop',
        description: 'Email agent stopped',
      });

      // Stop email monitoring
      emailProcessor.stopMonitoring(userId);

      res.json({ message: "Agent stopped successfully" });
    } catch (error) {
      console.error("Error stopping agent:", error);
      res.status(500).json({ message: "Failed to stop agent" });
    }
  });

  // Stats and activity routes
  app.get('/api/stats', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const stats = await storage.getUserStats(userId);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching stats:", error);
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });

  app.get('/api/activities', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const activities = await storage.getUserActivities(userId);
      res.json(activities);
    } catch (error) {
      console.error("Error fetching activities:", error);
      res.status(500).json({ message: "Failed to fetch activities" });
    }
  });

  // Email logs routes
  app.get('/api/email-logs', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const logs = await storage.getUserEmailLogs(userId);
      res.json(logs);
    } catch (error) {
      console.error("Error fetching email logs:", error);
      res.status(500).json({ message: "Failed to fetch email logs" });
    }
  });

  // Subscription routes
  app.get('/api/subscription', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      let subscription = await storage.getUserSubscription(userId);
      
      if (!subscription) {
        // Create default free subscription
        subscription = await storage.upsertSubscription({
          userId,
          plan: 'free',
          status: 'active',
          emailsUsed: 0,
          emailsLimit: 10,
        });
      }
      
      res.json(subscription);
    } catch (error) {
      console.error("Error fetching subscription:", error);
      res.status(500).json({ message: "Failed to fetch subscription" });
    }
  });

  // Payment routes (dummy implementation)
  app.post('/api/payment/process', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { plan } = req.body;
      
      // Simulate payment processing
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Update subscription
      const emailsLimit = plan === 'pro' ? 100 : plan === 'enterprise' ? -1 : 10;
      await storage.upsertSubscription({
        userId,
        plan,
        status: 'active',
        emailsUsed: 0,
        emailsLimit,
      });

      // Log activity
      await storage.insertActivity({
        userId,
        type: 'subscription_upgraded',
        description: `Upgraded to ${plan} plan`,
        metadata: { plan },
      });

      res.json({ message: "Payment processed successfully" });
    } catch (error) {
      console.error("Error processing payment:", error);
      res.status(500).json({ message: "Failed to process payment" });
    }
  });

  // Test OpenAI connection
  app.post('/api/test-openai', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { apiKey } = req.body;
      
      const isValid = await openaiService.testApiKey(apiKey);
      res.json({ valid: isValid });
    } catch (error) {
      console.error("Error testing OpenAI key:", error);
      res.status(500).json({ message: "Failed to test OpenAI key" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
