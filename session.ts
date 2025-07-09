// session.ts
import session from "express-session";
import MySQLStoreFactory from "express-mysql-session";
import dotenv from "dotenv";

dotenv.config(); // Load .env variables

const MySQLStore = MySQLStoreFactory(session);

// ✅ Automatically creates the sessions table
const sessionStore = new MySQLStore({
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
      data: "data",
    },
  },
});

export const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || "default_secret_key",
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 7, // 1 week
    httpOnly: true,
    secure: false, // ⚠️ Set to true in production with HTTPS
  },
});
