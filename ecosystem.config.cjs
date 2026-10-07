/**
 * MedRemote Backend — PM2 ecosystem config (NO Docker).
 *
 * Deploy on a Linux server that already runs other Node services by giving
 * MedRemote its OWN process name + port, so nothing collides.
 *
 * Usage (on the server, inside /var/www/medremote-backend):
 *   npm run build                     # compile to dist/
 *   pm2 start ecosystem.config.cjs    # start via this file
 *   pm2 save                          # persist across reboots
 *
 * Notes:
 *   - PORT reads from .env (your chosen port). If PORT is unset in .env,
 *     the app defaults to 8000 — set it explicitly to YOUR custom port.
 *   - env vars are loaded from backend/.env by dotenv at runtime.
 */
module.exports = {
  apps: [
    {
      name: "medremote-backend",
      script: "dist/src/server.js", // production build output (tsconfig rootDir is ".")
      cwd: __dirname,
      node_args: "--max-old-space-size=512",
      instances: 1,                     // single instance — avoids port conflicts
      autorestart: true,
      max_memory_restart: "600M",
      env: {
        NODE_ENV: "production",
        // PORT is taken from .env; we list it here only as a fallback override.
        // Change to your chosen port.
        PORT: process.env.PORT || "8010",
      },
      time: true,                       // timestamps in pm2 logs
      log_file: "./logs/pm2.log",
      out_file: "./logs/out.log",
      error_file: "./logs/err.log",
    },
    // Optional background jobs — run the scraper cron and match recalc worker
    // as separate PM2 processes. Comment out if you don't need them.
    // {
    //   name: "medremote-scraper",
    //   script: "npm",
    //   args: "run scrape",
    //   cwd: __dirname,
    //   autorestart: false,
    // },
    // {
    //   name: "medremote-matchworker",
    //   script: "npm",
    //   args: "run match:worker",
    //   cwd: __dirname,
    //   autorestart: true,
    // },
  ],
};