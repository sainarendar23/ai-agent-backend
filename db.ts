// db.ts
import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { schema } from './shared/schema'; // ✅ Ensure you're using named export
import dotenv from 'dotenv';

dotenv.config(); // ✅ Load variables from .env

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  connectionLimit: 10,
});

export const db = drizzle(pool, {
  schema,
  mode: 'default', // ✅ ADD THIS LINE to fix the error
});
