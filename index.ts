import express, { type Request, Response, NextFunction } from "express";
import dotenv from "dotenv";
import { registerRoutes } from "./routes";
import { sessionMiddleware } from "./session";
import { setupAuth } from "./auth"; // 👈 custom login system
import cors from "cors";


// Load environment variables
dotenv.config();

const app = express();

app.use(cors({  // 👈 Add this
  origin: process.env.CLIENT_URL,
  credentials: true
}));

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(sessionMiddleware); // 🔐 Session with MySQL
setupAuth(app);              // 🔑 Custom passport login/logout setup (✅ only once!)

// Logger (optional)
const log = console.log;
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
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
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

// 👇 Bootstrapping the server
(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  const port = process.env.PORT || 5000;
  server.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`✅ Backend running on http://localhost:${port}`);
    }
  );
})();
