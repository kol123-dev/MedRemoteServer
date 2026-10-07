# MedRemote Backend — Linux Deployment (NO Docker, PM2)

Deploy the backend on a Linux server that **already runs other Node services**
(`infinia-paybridge`, `infinia-pms-backend`, etc.) without any conflicts.

## Conflict-free strategy
- **Own folder:** `/var/www/medremote-backend` (separate from paybridge/pms).
- **Own port:** choose a free port (e.g. `8010`) via `PORT` in `.env`.
- **Own DB:** a dedicated MySQL database `medremote_prod` + user `medremote`.
- **Own PM2 process name:** `medremote-backend` (plus optional `medremote-scraper`,
  `medremote-matchworker`).
- **Own reverse-proxy block** in Nginx, mapping a subdomain to your port.

---

## 1. Get the code onto the server (git)
The repo intentionally commits **no** `.env`, `node_modules`, `dist`, or the
Windows Playwright browsers (`.browsers/`). Push the project, then on the server:

```bash
cd /var/www
git clone <YOUR_REPO_URL> medremote-backend
cd medremote-backend

# (if only the backend dir is tracked under a monorepo, cd into backend/)
cd backend
```

---

## 2. Node + PM2 prerequisites

```bash
node -v                 # want v18+ (ideally 20/22)
npm install -g pm2
pm2 -v

# If Node is old:
# curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
# sudo apt-get install -y nodejs
```

---

## 3. Install deps + generate Prisma client

```bash
cd /var/www/medremote-backend/backend
npm install
npx prisma generate

# Playwright browsers are only needed if you use ATS scraping.
npx playwright install --with-deps chromium
```

---

## 4. Create a dedicated MySQL database

```bash
mysql -u root -p
CREATE DATABASE medremote_prod CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'medremote'@'localhost' IDENTIFIED BY 'STRONG_PASSWORD_HERE';
GRANT ALL PRIVILEGES ON medremote_prod.* TO 'medremote'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

Push the schema (choose ONE):

```bash
# Option A — push schema directly
npx prisma db push

# Option B — run committed migrations
npx prisma migrate deploy

# Use A then seed:
npx prisma db seed    # optional: creates seed users (john@kipruto.ke, etc.)
```

---

## 5. Create the production `.env` (do NOT reuse local dev .env)

```bash
cp .env.production.example .env
nano .env
```

Fill in:
- `PORT` → **your free port** (e.g. `8010`)
- `JWT_SECRET`, `JWT_REFRESH_SECRET`, `SECRETS_ENCRYPTION_KEY` → strong random strings
- `DATABASE_URL` → the `medremote` DB you just created
- LLM, payment, Google, SMS keys as needed

Verify the env loads:
```bash
node -e "console.log(process.env.PORT, process.env.NODE_ENV)"
```

### Check for port conflicts
```bash
sudo ss -tlnp | grep 8010      # should return nothing before you start
```
If it is taken, pick another port and update `PORT` (and the reverse proxy below).

---

## 6. Build + run with PM2

```bash
cd /var/www/medremote-backend/backend
npm run build                 # compile TypeScript -> dist/
npx prisma generate
pm2 start ecosystem.config.cjs
pm2 save
pm2 status
```

Check it works:
```bash
pm2 logs medremote-backend
curl http://127.0.0.1:8010/api/jobs | head
```

Restart/stop/log on demand:
```bash
pm2 restart medremote-backend
pm2 stop medremote-backend
pm2 logs medremote-backend --lines 100
```

---

## 7. Optional background jobs (own PM2 entries)

Uncomment the `scraper` / `matchworker` blocks in `ecosystem.config.cjs`, or run:

```bash
pm2 start "npm run scrape"       --name medremote-scraper
pm2 start "npm run match:worker" --name medremote-matchworker
pm2 save
```

---

## 8. Nginx reverse proxy (HTTPS)

Add a server block so `api.your-domain.com` forwards to your chosen port:

```nginx
server {
    server_name api.your-domain.com;
    listen 80;

    location / {
        proxy_pass http://127.0.0.1:8010;        # match your PORT
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Then enable + HTTPS:
```bash
sudo ln -s /etc/nginx/sites-available/medremote /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d api.your-domain.com   # if using certbot
```

---

## 9. Point the frontend at the backend
In the frontend build set:
```
NEXT_PUBLIC_API_URL=https://api.your-domain.com
```
and build/deploy the Next.js app (Vercel or your server). Remember to update
`FRONTEND_URL`/`CORS_ORIGINS_ADDITIONAL` in the backend `.env` to the frontend URL.

---

## Security reminders
- `.env` is git-ignored — never commit it.
- Rotate any API keys (OpenAI/Anthropic) that ever appeared in plaintext.
- Use strong `JWT_SECRET`, `JWT_REFRESH_SECRET`, `SECRETS_ENCRYPTION_KEY`.
- Enable HTTPS in production (`COOKIE_SECURE_IN_PRODUCTION=true`).