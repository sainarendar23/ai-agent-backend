import {
  users,
  userCredentials,
  emailLogs,
  subscriptions,
  activities,
  type User,
  type UpsertUser,
  type UserCredentials,
  type InsertUserCredentials,
  type EmailLog,
  type InsertEmailLog,
  type Subscription,
  type InsertSubscription,
  type Activity,
  type InsertActivity,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and } from "drizzle-orm";

// Interface for storage operations
export interface IStorage {
  // User operations
  // (IMPORTANT) these user operations are mandatory for Replit Auth.
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  
  // User credentials operations
  getUserCredentials(userId: string): Promise<UserCredentials | undefined>;
  upsertUserCredentials(credentials: InsertUserCredentials): Promise<UserCredentials>;
  
  // Email logs operations
  insertEmailLog(log: InsertEmailLog): Promise<EmailLog>;
  getUserEmailLogs(userId: string, limit?: number): Promise<EmailLog[]>;
  
  // Subscription operations
  getUserSubscription(userId: string): Promise<Subscription | undefined>;
  upsertSubscription(subscription: InsertSubscription): Promise<Subscription>;
  
  // Activity operations
  insertActivity(activity: InsertActivity): Promise<Activity>;
  getUserActivities(userId: string, limit?: number): Promise<Activity[]>;
  
  // Stats operations
  getUserStats(userId: string): Promise<{
    emailsProcessed: number;
    autoReplies: number;
    starredEmails: number;
    successRate: number;
  }>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  // (IMPORTANT) these user operations are mandatory for Replit Auth.
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  // User credentials operations
  async getUserCredentials(userId: string): Promise<UserCredentials | undefined> {
    const [credentials] = await db
      .select()
      .from(userCredentials)
      .where(eq(userCredentials.userId, userId));
    return credentials;
  }

  async upsertUserCredentials(credentials: InsertUserCredentials): Promise<UserCredentials> {
    const [result] = await db
      .insert(userCredentials)
      .values(credentials)
      .onConflictDoUpdate({
        target: userCredentials.userId,
        set: {
          ...credentials,
          updatedAt: new Date(),
        },
      })
      .returning();
    return result;
  }

  // Email logs operations
  async insertEmailLog(log: InsertEmailLog): Promise<EmailLog> {
    const [result] = await db.insert(emailLogs).values(log).returning();
    return result;
  }

  async getUserEmailLogs(userId: string, limit: number = 50): Promise<EmailLog[]> {
    return await db
      .select()
      .from(emailLogs)
      .where(eq(emailLogs.userId, userId))
      .orderBy(desc(emailLogs.createdAt))
      .limit(limit);
  }

  // Subscription operations
  async getUserSubscription(userId: string): Promise<Subscription | undefined> {
    const [subscription] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId));
    return subscription;
  }

  async upsertSubscription(subscription: InsertSubscription): Promise<Subscription> {
    const [result] = await db
      .insert(subscriptions)
      .values(subscription)
      .onConflictDoUpdate({
        target: subscriptions.userId,
        set: {
          ...subscription,
          updatedAt: new Date(),
        },
      })
      .returning();
    return result;
  }

  // Activity operations
  async insertActivity(activity: InsertActivity): Promise<Activity> {
    const [result] = await db.insert(activities).values(activity).returning();
    return result;
  }

  async getUserActivities(userId: string, limit: number = 10): Promise<Activity[]> {
    return await db
      .select()
      .from(activities)
      .where(eq(activities.userId, userId))
      .orderBy(desc(activities.createdAt))
      .limit(limit);
  }

  // Stats operations
  async getUserStats(userId: string): Promise<{
    emailsProcessed: number;
    autoReplies: number;
    starredEmails: number;
    successRate: number;
  }> {
    const logs = await db
      .select()
      .from(emailLogs)
      .where(eq(emailLogs.userId, userId));

    const emailsProcessed = logs.length;
    const autoReplies = logs.filter(log => log.action === 'reply').length;
    const starredEmails = logs.filter(log => log.action === 'star').length;
    const successfulEmails = logs.filter(log => log.status === 'sent').length;
    const successRate = emailsProcessed > 0 ? Math.round((successfulEmails / emailsProcessed) * 100) : 0;

    return {
      emailsProcessed,
      autoReplies,
      starredEmails,
      successRate,
    };
  }
}

export const storage = new DatabaseStorage();
