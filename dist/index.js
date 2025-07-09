// index.ts
import express from "express";
import dotenv3 from "dotenv";

// routes.ts
import { createServer } from "http";

// shared/schema.ts
import {
  pgTable,
  text,
  varchar,
  timestamp,
  jsonb,
  index,
  serial,
  boolean,
  integer
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
var sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull()
  },
  (table) => [index("IDX_session_expire").on(table.expire)]
);
var users = pgTable("users", {
  id: varchar("id").primaryKey().notNull(),
  email: varchar("email").unique().notNull(),
  password: text("password").notNull(),
  // ✅ Required for login
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var userCredentials = pgTable("user_credentials", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  agentType: varchar("agent_type").default("gmail"),
  openaiApiKey: text("openai_api_key"),
  gmailAccessToken: text("gmail_access_token"),
  gmailRefreshToken: text("gmail_refresh_token"),
  gmailTokenExpiry: timestamp("gmail_token_expiry"),
  githubAccessToken: text("github_access_token"),
  githubUsername: varchar("github_username"),
  businessApiKey: text("business_api_key"),
  configData: jsonb("config_data"),
  resumeLink: text("resume_link"),
  personalDescription: text("personal_description"),
  agentActive: boolean("agent_active").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var emailLogs = pgTable("email_logs", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  emailId: text("email_id").notNull(),
  fromEmail: text("from_email").notNull(),
  subject: text("subject"),
  action: text("action").notNull(),
  responseText: text("response_text"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow()
});
var subscriptions = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  plan: text("plan").notNull().default("free"),
  status: text("status").notNull().default("active"),
  emailsUsed: integer("emails_used").default(0),
  emailsLimit: integer("emails_limit").default(10),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var activities = pgTable("activities", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  type: text("type").notNull(),
  description: text("description").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow()
});
var insertUserCredentialsSchema = createInsertSchema(userCredentials).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
var insertEmailLogSchema = createInsertSchema(emailLogs).omit({
  id: true,
  createdAt: true
});
var insertSubscriptionSchema = createInsertSchema(subscriptions).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
var insertActivitySchema = createInsertSchema(activities).omit({
  id: true,
  createdAt: true
});
var schema = {
  users,
  userCredentials,
  emailLogs,
  subscriptions,
  activities,
  sessions
};

// db.ts
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();
var pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  connectionLimit: 10
});
var db = drizzle(pool, {
  schema,
  mode: "default"
  // ✅ ADD THIS LINE to fix the error
});

// storage.ts
import { eq, desc } from "drizzle-orm";
var DatabaseStorage = class {
  // User operations
  // (IMPORTANT) these user operations are mandatory for Replit Auth.
  async getUser(id) {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }
  async upsertUser(userData) {
    const [user] = await db.insert(users).values(userData).onConflictDoUpdate({
      target: users.id,
      set: {
        ...userData,
        updatedAt: /* @__PURE__ */ new Date()
      }
    }).returning();
    return user;
  }
  // User credentials operations
  async getUserCredentials(userId) {
    const [credentials] = await db.select().from(userCredentials).where(eq(userCredentials.userId, userId));
    return credentials;
  }
  async upsertUserCredentials(credentials) {
    const [result] = await db.insert(userCredentials).values(credentials).onConflictDoUpdate({
      target: userCredentials.userId,
      set: {
        ...credentials,
        updatedAt: /* @__PURE__ */ new Date()
      }
    }).returning();
    return result;
  }
  // Email logs operations
  async insertEmailLog(log2) {
    const [result] = await db.insert(emailLogs).values(log2).returning();
    return result;
  }
  async getUserEmailLogs(userId, limit = 50) {
    return await db.select().from(emailLogs).where(eq(emailLogs.userId, userId)).orderBy(desc(emailLogs.createdAt)).limit(limit);
  }
  // Subscription operations
  async getUserSubscription(userId) {
    const [subscription] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId));
    return subscription;
  }
  async upsertSubscription(subscription) {
    const [result] = await db.insert(subscriptions).values(subscription).onConflictDoUpdate({
      target: subscriptions.userId,
      set: {
        ...subscription,
        updatedAt: /* @__PURE__ */ new Date()
      }
    }).returning();
    return result;
  }
  // Activity operations
  async insertActivity(activity) {
    const [result] = await db.insert(activities).values(activity).returning();
    return result;
  }
  async getUserActivities(userId, limit = 10) {
    return await db.select().from(activities).where(eq(activities.userId, userId)).orderBy(desc(activities.createdAt)).limit(limit);
  }
  // Stats operations
  async getUserStats(userId) {
    const logs = await db.select().from(emailLogs).where(eq(emailLogs.userId, userId));
    const emailsProcessed = logs.length;
    const autoReplies = logs.filter((log2) => log2.action === "reply").length;
    const starredEmails = logs.filter((log2) => log2.action === "star").length;
    const successfulEmails = logs.filter((log2) => log2.status === "sent").length;
    const successRate = emailsProcessed > 0 ? Math.round(successfulEmails / emailsProcessed * 100) : 0;
    return {
      emailsProcessed,
      autoReplies,
      starredEmails,
      successRate
    };
  }
};
var storage = new DatabaseStorage();

// auth.ts
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcryptjs";
import { eq as eq2 } from "drizzle-orm";
var { users: users2 } = schema;
passport.use(
  new LocalStrategy(
    { usernameField: "email", passwordField: "password" },
    async (email, password, done) => {
      try {
        const user = await db.query.users.findFirst({
          where: eq2(users2.email, email)
        });
        if (!user) {
          return done(null, false, { message: "Invalid email" });
        }
        const match = await bcrypt.compare(password, user.password || "");
        if (!match) {
          return done(null, false, { message: "Invalid password" });
        }
        return done(null, user);
      } catch (error) {
        return done(error);
      }
    }
  )
);
passport.serializeUser((user, done) => {
  done(null, user.id);
});
passport.deserializeUser(async (id, done) => {
  try {
    const user = await db.query.users.findFirst({
      where: eq2(users2.id, id)
    });
    done(null, user || false);
  } catch (error) {
    done(error);
  }
});
function setupAuth(app2) {
  app2.use(passport.initialize());
  app2.use(passport.session());
  app2.post("/api/signup", async (req, res) => {
    const { email, password, firstName, lastName } = req.body;
    try {
      const existing = await db.query.users.findFirst({
        where: eq2(users2.email, email)
      });
      if (existing) {
        return res.status(400).json({ message: "User already exists" });
      }
      const hashedPassword = await bcrypt.hash(password, 10);
      const newUserId = uuidv4();
      await db.insert(users2).values({
        id: newUserId,
        email,
        password: hashedPassword,
        firstName,
        lastName
      });
      res.status(201).json({ message: "User registered successfully" });
    } catch (error) {
      console.error("Signup failed:", error);
      res.status(500).json({ message: "Signup failed" });
    }
  });
  app2.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err, user, info) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ message: info.message });
      req.logIn(user, (err2) => {
        if (err2) return next(err2);
        res.json({ message: "Login successful", user });
      });
    })(req, res, next);
  });
  app2.post("/api/logout", (req, res) => {
    req.logout(() => {
      res.json({ message: "Logged out" });
    });
  });
  app2.get("/api/me", isAuthenticated, (req, res) => {
    res.json({ user: req.user });
  });
}
var isAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) return next();
  return res.status(401).json({ message: "Unauthorized" });
};

// services/gmailService.ts
import { google } from "googleapis";
var GmailService = class {
  oauth2Client;
  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET,
      process.env.GMAIL_REDIRECT_URI || "http://localhost:5000/api/gmail/callback"
    );
  }
  async getAuthUrl(userId) {
    const scopes = [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.modify"
    ];
    const authUrl = this.oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: scopes,
      state: userId
    });
    return authUrl;
  }
  async handleCallback(userId, code) {
    const { tokens } = await this.oauth2Client.getAccessToken(code);
    await storage.upsertUserCredentials({
      userId,
      gmailAccessToken: tokens.access_token,
      gmailRefreshToken: tokens.refresh_token,
      gmailTokenExpiry: new Date(tokens.expiry_date)
    });
  }
  async getAuthenticatedClient(userId) {
    const credentials = await storage.getUserCredentials(userId);
    if (!credentials?.gmailAccessToken) {
      throw new Error("Gmail not connected");
    }
    this.oauth2Client.setCredentials({
      access_token: credentials.gmailAccessToken,
      refresh_token: credentials.gmailRefreshToken
    });
    return this.oauth2Client;
  }
  async getEmails(userId, query = "", maxResults = 10) {
    const auth = await this.getAuthenticatedClient(userId);
    const gmail = google.gmail({ version: "v1", auth });
    const response = await gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults
    });
    const emails = [];
    if (response.data.messages) {
      for (const message of response.data.messages) {
        const email = await gmail.users.messages.get({
          userId: "me",
          id: message.id
        });
        emails.push(email.data);
      }
    }
    return emails;
  }
  async sendEmail(userId, to, subject, body) {
    const auth = await this.getAuthenticatedClient(userId);
    const gmail = google.gmail({ version: "v1", auth });
    const email = [
      `To: ${to}`,
      `Subject: ${subject}`,
      "",
      body
    ].join("\n");
    const base64Email = Buffer.from(email).toString("base64");
    await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: base64Email
      }
    });
  }
  async starEmail(userId, messageId) {
    const auth = await this.getAuthenticatedClient(userId);
    const gmail = google.gmail({ version: "v1", auth });
    await gmail.users.messages.modify({
      userId: "me",
      id: messageId,
      requestBody: {
        addLabelIds: ["STARRED"]
      }
    });
  }
  async getEmailContent(email) {
    const headers = email.payload.headers;
    const from = headers.find((h) => h.name === "From")?.value || "";
    const subject = headers.find((h) => h.name === "Subject")?.value || "";
    let body = "";
    if (email.payload.body?.data) {
      body = Buffer.from(email.payload.body.data, "base64").toString();
    } else if (email.payload.parts) {
      for (const part of email.payload.parts) {
        if (part.mimeType === "text/plain" && part.body?.data) {
          body = Buffer.from(part.body.data, "base64").toString();
          break;
        }
      }
    }
    return { from, subject, body };
  }
};
var gmailService = new GmailService();

// services/openaiService.ts
import OpenAI from "openai";
var OpenAIService = class {
  getClient(apiKey) {
    return new OpenAI({ apiKey });
  }
  async testApiKey(apiKey) {
    try {
      const openai = this.getClient(apiKey);
      await openai.models.list();
      return true;
    } catch (error) {
      return false;
    }
  }
  async analyzeEmail(userId, emailContent) {
    const credentials = await storage.getUserCredentials(userId);
    if (!credentials?.openaiApiKey) {
      throw new Error("OpenAI API key not configured");
    }
    const openai = this.getClient(credentials.openaiApiKey);
    const prompt = `
Analyze this email content and determine the appropriate action for a job seeker:

Email Content:
${emailContent}

Rules:
1. If the email asks for a resume/CV, respond with "reply"
2. If the email mentions being selected for next round, interview, or positive response, respond with "star"
3. Otherwise, respond with "ignore"

Respond with JSON in this format:
{
  "action": "reply|star|ignore",
  "confidence": number between 0-1,
  "reasoning": "brief explanation"
}
    `;
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are an expert email analyzer for job seekers. Analyze emails and determine the best action to take."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" }
      });
      const result = JSON.parse(response.choices[0].message.content || "{}");
      return {
        action: result.action || "ignore",
        confidence: Math.max(0, Math.min(1, result.confidence || 0)),
        reasoning: result.reasoning || "No reasoning provided"
      };
    } catch (error) {
      console.error("Error analyzing email:", error);
      return {
        action: "ignore",
        confidence: 0,
        reasoning: "Error analyzing email"
      };
    }
  }
  async generateReply(userId, emailContent, fromEmail) {
    const credentials = await storage.getUserCredentials(userId);
    if (!credentials?.openaiApiKey) {
      throw new Error("OpenAI API key not configured");
    }
    const openai = this.getClient(credentials.openaiApiKey);
    const personalDescription = credentials.personalDescription || "a job seeker";
    const resumeLink = credentials.resumeLink || "";
    const prompt = `
Generate a professional email reply for a job seeker who received this email:

Original Email:
${emailContent}

Context:
- You are ${personalDescription}
- Resume link: ${resumeLink}
- This is a response to a job application

Generate a polite, professional reply that:
1. Thanks them for their interest
2. Provides the resume link if they asked for it
3. Expresses enthusiasm for the opportunity
4. Keeps it concise and professional

Do not include subject line or email headers, just the body text.
    `;
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are a professional email writer helping job seekers respond to employers."
          },
          {
            role: "user",
            content: prompt
          }
        ]
      });
      return response.choices[0].message.content || "Thank you for your interest. Please find my resume attached.";
    } catch (error) {
      console.error("Error generating reply:", error);
      return "Thank you for your interest. Please find my resume attached.";
    }
  }
};
var openaiService = new OpenAIService();

// services/emailProcessor.ts
var EmailProcessor = class {
  monitoringIntervals = /* @__PURE__ */ new Map();
  async startMonitoring(userId) {
    this.stopMonitoring(userId);
    const interval = setInterval(async () => {
      try {
        await this.processNewEmails(userId);
      } catch (error) {
        console.error(`Error processing emails for user ${userId}:`, error);
      }
    }, 5 * 60 * 1e3);
    this.monitoringIntervals.set(userId, interval);
    await this.processNewEmails(userId);
  }
  stopMonitoring(userId) {
    const interval = this.monitoringIntervals.get(userId);
    if (interval) {
      clearInterval(interval);
      this.monitoringIntervals.delete(userId);
    }
  }
  async processNewEmails(userId) {
    try {
      const credentials = await storage.getUserCredentials(userId);
      if (!credentials?.agentActive) {
        return;
      }
      const query = "is:unread newer_than:1d";
      const emails = await gmailService.getEmails(userId, query, 10);
      for (const email of emails) {
        await this.processEmail(userId, email);
      }
    } catch (error) {
      console.error(`Error processing new emails for user ${userId}:`, error);
    }
  }
  async processEmail(userId, email) {
    try {
      const logs = await storage.getUserEmailLogs(userId);
      const alreadyProcessed = logs.some((log2) => log2.emailId === email.id);
      if (alreadyProcessed) {
        return;
      }
      const { from, subject, body } = await gmailService.getEmailContent(email);
      const analysis = await openaiService.analyzeEmail(userId, body);
      const emailLog = await storage.insertEmailLog({
        userId,
        emailId: email.id,
        fromEmail: from,
        subject,
        action: analysis.action,
        status: "pending"
      });
      switch (analysis.action) {
        case "reply":
          await this.handleReplyAction(userId, email, emailLog.id, from, body);
          break;
        case "star":
          await this.handleStarAction(userId, email, emailLog.id);
          break;
        case "ignore":
          break;
      }
      await storage.insertActivity({
        userId,
        type: `email_${analysis.action}`,
        description: `Email ${analysis.action === "reply" ? "replied to" : analysis.action === "star" ? "starred" : "processed"}: ${subject}`,
        metadata: {
          from,
          subject,
          action: analysis.action,
          confidence: analysis.confidence
        }
      });
    } catch (error) {
      console.error(`Error processing email ${email.id}:`, error);
    }
  }
  async handleReplyAction(userId, email, logId, fromEmail, body) {
    try {
      const replyText = await openaiService.generateReply(userId, body, fromEmail);
      const { subject } = await gmailService.getEmailContent(email);
      const replySubject = subject.startsWith("Re:") ? subject : `Re: ${subject}`;
      await gmailService.sendEmail(userId, fromEmail, replySubject, replyText);
      await storage.insertEmailLog({
        userId,
        emailId: email.id,
        fromEmail,
        subject: replySubject,
        action: "reply",
        responseText: replyText,
        status: "sent"
      });
    } catch (error) {
      console.error(`Error sending reply for email ${email.id}:`, error);
      await storage.insertEmailLog({
        userId,
        emailId: email.id,
        fromEmail,
        subject: "Reply failed",
        action: "reply",
        status: "failed"
      });
    }
  }
  async handleStarAction(userId, email, logId) {
    try {
      await gmailService.starEmail(userId, email.id);
      await storage.insertEmailLog({
        userId,
        emailId: email.id,
        fromEmail: "",
        subject: "Email starred",
        action: "star",
        status: "sent"
      });
    } catch (error) {
      console.error(`Error starring email ${email.id}:`, error);
      await storage.insertEmailLog({
        userId,
        emailId: email.id,
        fromEmail: "",
        subject: "Star failed",
        action: "star",
        status: "failed"
      });
    }
  }
};
var emailProcessor = new EmailProcessor();

// routes.ts
async function registerRoutes(app2) {
  app2.get("/api/auth/user", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });
  app2.get("/api/credentials", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user.id;
      const credentials = await storage.getUserCredentials(userId);
      if (credentials) {
        const safeCredentials = {
          ...credentials,
          openaiApiKey: credentials.openaiApiKey ? "***" : null,
          gmailAccessToken: credentials.gmailAccessToken ? "connected" : null,
          gmailRefreshToken: void 0
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
  app2.post("/api/credentials", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user.id;
      const credentialsData = insertUserCredentialsSchema.parse({
        ...req.body,
        userId
      });
      await storage.upsertUserCredentials(credentialsData);
      res.json({ message: "Credentials updated successfully" });
    } catch (error) {
      console.error("Error updating credentials:", error);
      res.status(500).json({ message: "Failed to update credentials" });
    }
  });
  app2.get("/api/gmail/auth", isAuthenticated, async (req, res) => {
    try {
      const authUrl = await gmailService.getAuthUrl(req.user.id);
      res.json({ authUrl });
    } catch (error) {
      console.error("Error generating Gmail auth URL:", error);
      res.status(500).json({ message: "Failed to generate auth URL" });
    }
  });
  app2.get("/api/gmail/callback", isAuthenticated, async (req, res) => {
    try {
      const { code } = req.query;
      if (!code) {
        return res.status(400).json({ message: "Authorization code required" });
      }
      await gmailService.handleCallback(req.user.id, code);
      await storage.insertActivity({
        userId: req.user.id,
        type: "gmail_connected",
        description: "Gmail account connected successfully"
      });
      res.redirect("/?gmail=connected");
    } catch (error) {
      console.error("Error handling Gmail callback:", error);
      res.status(500).json({ message: "Failed to connect Gmail" });
    }
  });
  app2.post("/api/agent/start", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user.id;
      const credentials = await storage.getUserCredentials(userId);
      if (!credentials?.openaiApiKey || !credentials?.gmailAccessToken) {
        return res.status(400).json({ message: "Please configure OpenAI API key and Gmail access first" });
      }
      await storage.upsertUserCredentials({
        userId,
        agentActive: true
      });
      await storage.insertActivity({
        userId,
        type: "agent_start",
        description: "Email agent started successfully"
      });
      emailProcessor.startMonitoring(userId);
      res.json({ message: "Agent started successfully" });
    } catch (error) {
      console.error("Error starting agent:", error);
      res.status(500).json({ message: "Failed to start agent" });
    }
  });
  app2.post("/api/agent/stop", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user.id;
      await storage.upsertUserCredentials({
        userId,
        agentActive: false
      });
      await storage.insertActivity({
        userId,
        type: "agent_stop",
        description: "Email agent stopped"
      });
      emailProcessor.stopMonitoring(userId);
      res.json({ message: "Agent stopped successfully" });
    } catch (error) {
      console.error("Error stopping agent:", error);
      res.status(500).json({ message: "Failed to stop agent" });
    }
  });
  app2.get("/api/stats", isAuthenticated, async (req, res) => {
    try {
      const stats = await storage.getUserStats(req.user.id);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching stats:", error);
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });
  app2.get("/api/activities", isAuthenticated, async (req, res) => {
    try {
      const activities2 = await storage.getUserActivities(req.user.id);
      res.json(activities2);
    } catch (error) {
      console.error("Error fetching activities:", error);
      res.status(500).json({ message: "Failed to fetch activities" });
    }
  });
  app2.get("/api/email-logs", isAuthenticated, async (req, res) => {
    try {
      const logs = await storage.getUserEmailLogs(req.user.id);
      res.json(logs);
    } catch (error) {
      console.error("Error fetching email logs:", error);
      res.status(500).json({ message: "Failed to fetch email logs" });
    }
  });
  app2.get("/api/subscription", isAuthenticated, async (req, res) => {
    try {
      let subscription = await storage.getUserSubscription(req.user.id);
      if (!subscription) {
        subscription = await storage.upsertSubscription({
          userId: req.user.id,
          plan: "free",
          status: "active",
          emailsUsed: 0,
          emailsLimit: 10
        });
      }
      res.json(subscription);
    } catch (error) {
      console.error("Error fetching subscription:", error);
      res.status(500).json({ message: "Failed to fetch subscription" });
    }
  });
  app2.post("/api/payment/process", isAuthenticated, async (req, res) => {
    try {
      const { plan } = req.body;
      const emailsLimit = plan === "pro" ? 100 : plan === "enterprise" ? -1 : 10;
      await new Promise((resolve) => setTimeout(resolve, 2e3));
      await storage.upsertSubscription({
        userId: req.user.id,
        plan,
        status: "active",
        emailsUsed: 0,
        emailsLimit
      });
      await storage.insertActivity({
        userId: req.user.id,
        type: "subscription_upgraded",
        description: `Upgraded to ${plan} plan`,
        metadata: { plan }
      });
      res.json({ message: "Payment processed successfully" });
    } catch (error) {
      console.error("Error processing payment:", error);
      res.status(500).json({ message: "Failed to process payment" });
    }
  });
  app2.post("/api/test-openai", isAuthenticated, async (req, res) => {
    try {
      const { apiKey } = req.body;
      const isValid = await openaiService.testApiKey(apiKey);
      res.json({ valid: isValid });
    } catch (error) {
      console.error("Error testing OpenAI key:", error);
      res.status(500).json({ message: "Failed to test OpenAI key" });
    }
  });
  const httpServer = createServer(app2);
  return httpServer;
}

// session.ts
import session from "express-session";
import MySQLStoreFactory from "express-mysql-session";
import dotenv2 from "dotenv";
dotenv2.config();
var MySQLStore = MySQLStoreFactory(session);
var sessionStore = new MySQLStore({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASS || "2003",
  database: process.env.DB_NAME || "ai-agent",
  createDatabaseTable: true,
  schema: {
    tableName: "sessions",
    columnNames: {
      session_id: "session_id",
      expires: "expires",
      data: "data"
    }
  }
});
var sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || "default_secret_key",
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  cookie: {
    maxAge: 1e3 * 60 * 60 * 24 * 7,
    // 1 week
    httpOnly: true,
    secure: false
    // ⚠️ Set to true in production with HTTPS
  }
});

// index.ts
import cors from "cors";
dotenv3.config();
var app = express();
app.use(cors({
  // 👈 Add this
  origin: process.env.CLIENT_URL,
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(sessionMiddleware);
setupAuth(app);
var log = console.log;
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse = void 0;
  const originalResJson = res.json;
  res.json = function(bodyJson, ...args) {
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
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "\u2026";
      }
      log(logLine);
    }
  });
  next();
});
(async () => {
  const server = await registerRoutes(app);
  app.use((err, _req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
    throw err;
  });
  const port = process.env.PORT || 5e3;
  server.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true
    },
    () => {
      log(`\u2705 Backend running on http://localhost:${port}`);
    }
  );
})();
