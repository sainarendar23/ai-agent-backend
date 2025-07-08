import {
  pgTable,
  text,
  varchar,
  timestamp,
  jsonb,
  index,
  serial,
  boolean,
  integer,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const users = pgTable("users", {
  id: varchar("id").primaryKey().notNull(),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// User credentials and settings
export const userCredentials = pgTable("user_credentials", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  agentType: varchar("agent_type").default("gmail"), // 'gmail', 'github', 'business'
  openaiApiKey: text("openai_api_key"),
  gmailAccessToken: text("gmail_access_token"),
  gmailRefreshToken: text("gmail_refresh_token"),
  gmailTokenExpiry: timestamp("gmail_token_expiry"),
  githubAccessToken: text("github_access_token"), // GitHub-specific
  githubUsername: varchar("github_username"),
  businessApiKey: text("business_api_key"), // Business-specific
  configData: jsonb("config_data"), // Store agent-specific configuration
  resumeLink: text("resume_link"),
  personalDescription: text("personal_description"),
  agentActive: boolean("agent_active").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Email processing logs
export const emailLogs = pgTable("email_logs", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  emailId: text("email_id").notNull(),
  fromEmail: text("from_email").notNull(),
  subject: text("subject"),
  action: text("action").notNull(), // 'reply', 'star', 'ignore'
  responseText: text("response_text"),
  status: text("status").notNull().default('pending'), // 'pending', 'sent', 'failed'
  createdAt: timestamp("created_at").defaultNow(),
});

// User subscriptions
export const subscriptions = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  plan: text("plan").notNull().default('free'), // 'free', 'pro', 'enterprise'
  status: text("status").notNull().default('active'), // 'active', 'cancelled', 'expired'
  emailsUsed: integer("emails_used").default(0),
  emailsLimit: integer("emails_limit").default(10),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// User activity feed
export const activities = pgTable("activities", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  type: text("type").notNull(), // 'email_reply', 'email_star', 'agent_start', 'agent_stop'
  description: text("description").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ✅ Type Inference
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type UserCredentials = typeof userCredentials.$inferSelect;
export type InsertUserCredentials = typeof userCredentials.$inferInsert;
export type EmailLog = typeof emailLogs.$inferSelect;
export type InsertEmailLog = typeof emailLogs.$inferInsert;
export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = typeof subscriptions.$inferInsert;
export type Activity = typeof activities.$inferSelect;
export type InsertActivity = typeof activities.$inferInsert;

// ✅ Zod Validation Schemas
export const insertUserCredentialsSchema = createInsertSchema(userCredentials).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertEmailLogSchema = createInsertSchema(emailLogs).omit({
  id: true,
  createdAt: true,
});

export const insertSubscriptionSchema = createInsertSchema(subscriptions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertActivitySchema = createInsertSchema(activities).omit({
  id: true,
  createdAt: true,
});

// ✅ ✅ Drizzle schema export (FOR db.ts usage)
export const schema = {
  users,
  userCredentials,
  emailLogs,
  subscriptions,
  activities,
  sessions,
};
