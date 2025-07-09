// auth.ts
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import type { Express, RequestHandler } from "express";
import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { schema } from "./shared/schema";

const { users } = schema; // ✅ Correct usage from schema object

// 🔐 Local login strategy
passport.use(
  new LocalStrategy(
    { usernameField: "email", passwordField: "password" },
    async (email, password, done) => {
      try {
        const user = await db.query.users.findFirst({
          where: eq(users.email, email),
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

// 🔁 Serialize & deserialize user for session
passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await db.query.users.findFirst({
      where: eq(users.id, id),
    });
    done(null, user || false);
  } catch (error) {
    done(error);
  }
});

// 🔧 Setup auth endpoints
export function setupAuth(app: Express) {
  app.use(passport.initialize());
  app.use(passport.session());

  // ✨ Signup
  app.post("/api/signup", async (req, res) => {
    const { email, password, firstName, lastName } = req.body;

    try {
      const existing = await db.query.users.findFirst({
        where: eq(users.email, email),
      });

      if (existing) {
        return res.status(400).json({ message: "User already exists" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const newUserId = uuidv4();

      await db.insert(users).values({
        id: newUserId,
        email,
        password: hashedPassword,
        firstName,
        lastName,
      });

      res.status(201).json({ message: "User registered successfully" });
    } catch (error) {
      console.error("Signup failed:", error);
      res.status(500).json({ message: "Signup failed" });
    }
  });

  // 🔑 Login
  app.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err, user, info) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ message: info.message });

      req.logIn(user, (err) => {
        if (err) return next(err);
        res.json({ message: "Login successful", user });
      });
    })(req, res, next);
  });

  // 🚪 Logout
  app.post("/api/logout", (req, res) => {
    req.logout(() => {
      res.json({ message: "Logged out" });
    });
  });

  // ✅ Auth check route
  app.get("/api/me", isAuthenticated, (req, res) => {
    res.json({ user: req.user });
  });
}

// ✅ Route protection middleware
export const isAuthenticated: RequestHandler = (req, res, next) => {
  if (req.isAuthenticated()) return next();
  return res.status(401).json({ message: "Unauthorized" });
};
