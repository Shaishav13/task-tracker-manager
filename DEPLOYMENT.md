# 🚀 Task Tracker Manager (TTM) — Production Deployment Guide

This guide covers deploying the full-stack TTM platform using either:
- **Strategy A (Recommended)**: Containerized deployment via **Docker Compose** (deployable to any VPS, DigitalOcean Droplet, AWS EC2, or Railway).
- **Strategy B**: Managed Cloud Services (**Render** / **Railway** for backend services + **Vercel** / **Netlify** for frontend + **Neon** / **Supabase** for PostgreSQL).

---

## 🏗 System Components & Requirements

| Service | Technology | Port | Public Endpoint | Required Env Vars |
| :--- | :--- | :---: | :---: | :--- |
| **PostgreSQL** | Postgres 16 | `5432` | Internal | `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` |
| **Backend API** | NestJS + Prisma | `3000` | `/api/docs` | `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `PORT`, `CLIENT_URL` |
| **Analytics Engine** | FastAPI + Pandas | `8000` | `/docs` | `DATABASE_URL`, `JWT_SECRET`, `JWT_ALGORITHM`, `PORT`, `CLIENT_URL` |
| **Frontend SPA** | Angular 19 + Nginx | `80` (or `4200`) | `/` | Injected via environment or reverse proxy |

---

## 🐳 Strategy A: Docker Compose Deployment (Recommended)

All services have pre-configured multi-stage production Dockerfiles and a root [`docker-compose.yml`](file:///d:/project2.0/TTM/docker-compose.yml).

### 1. Prerequisites on Server
Ensure Docker and Docker Compose are installed on your Linux / Windows / Cloud host:
```bash
docker --version
docker compose version
```

### 2. Clone Repository
```bash
git clone https://github.com/Shaishav13/task-tracker-manager.git
cd task-tracker-manager
```

### 3. Review Environment Configuration
In `docker-compose.yml`, customize secrets and client URLs as needed:
```yaml
POSTGRES_PASSWORD: "YourSecureDatabasePassword"
JWT_SECRET: "YourStrongJwtSecretKey_32chars_min"
JWT_REFRESH_SECRET: "YourStrongRefreshKey_32chars_min"
CLIENT_URL: "https://yourdomain.com,http://localhost:4200"
```

### 4. Build and Start All Services
```bash
docker compose up -d --build
```

### 5. Verify Running Containers
```bash
docker compose ps
```
All four containers (`ttm_postgres`, `ttm_backend`, `ttm_analytics`, and `ttm_frontend`) should report status **Up / Healthy**.

The backend container will automatically run `prisma migrate deploy` and `seed.js` on first startup, provisioning all roles and the root super admin user!

---

## ☁️ Strategy B: Managed Cloud Services (Render / Railway / Vercel)

### Step 1: Provision Managed PostgreSQL
1. Create a free PostgreSQL database on [Render](https://render.com), [Neon](https://neon.tech), or [Supabase](https://supabase.com).
2. Copy the connection string (`DATABASE_URL`). Example:
   ```
   postgresql://user:password@ep-host.region.neon.tech/neondb?sslmode=require
   ```

---

### Step 2: Deploy NestJS Backend (`ttm_backend`)
1. Create a **New Web Service** connected to your GitHub repo on Render or Railway.
2. Configure settings:
   - **Root Directory**: `ttm_backend`
   - **Environment**: `Node` (or Docker)
   - **Build Command**: `npm ci && npx prisma generate && npm run build`
   - **Start Command**: `npx prisma migrate deploy && node dist/prisma/seed.js && node dist/src/main.js`
3. Add Environment Variables:
   - `DATABASE_URL`: *(Your managed PostgreSQL connection string)*
   - `JWT_SECRET`: `super_secret_access_key_12345` *(generate a secure random string)*
   - `JWT_REFRESH_SECRET`: `super_secret_refresh_key_67890`
   - `PORT`: `3000` (or `10000` on Render)
   - `CLIENT_URL`: *(Your deployed frontend URL, e.g. `https://your-ttm-app.vercel.app`)*
4. Once deployed, verify: `https://your-backend-url.onrender.com/api/docs`

---

### Step 3: Deploy FastAPI Analytics Engine (`ttm_analytics_service`)
1. Create a **New Web Service** connected to your GitHub repo on Render or Railway.
2. Configure settings:
   - **Root Directory**: `ttm_analytics_service`
   - **Environment**: `Python 3` (or Docker)
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
3. Add Environment Variables:
   - `DATABASE_URL`: *(Same managed PostgreSQL connection string)*
   - `JWT_SECRET`: *(Must match the backend's `JWT_SECRET`)*
   - `JWT_ALGORITHM`: `HS256`
   - `CLIENT_URL`: *(Your deployed frontend URL)*
4. Once deployed, verify: `https://your-analytics-url.onrender.com/docs`

---

### Step 4: Deploy Angular Frontend (`ttm_frontend`)
1. Create a **New Project** on [Vercel](https://vercel.com) or [Netlify](https://netlify.com).
2. Configure settings:
   - **Root Directory**: `ttm_frontend`
   - **Framework Preset**: `Angular`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist/ttm_frontend/browser`
3. In `ttm_frontend/src/environments/environment.prod.ts`, point `apiUrl` and `analyticsUrl` to your deployed backend URLs, or inject them into `window.__env`.
4. Deploy!

---

## 🔒 Post-Deployment Checklist

1. **Initial Login**:
   - Access the frontend login page.
   - Credentials:
     - **Email**: `superadmin@company.local`
     - **Password**: `SuperAdminPass123!`
2. **Change Super Admin Password**:
   - Navigate to profile / account settings and update your default seed password.
3. **CORS Verification**:
   - Ensure the frontend origin is included in `CLIENT_URL` for both backend and analytics service.
4. **HTTPS / SSL**:
   - When using custom domains, verify SSL certificates are active (automatic on Vercel/Render/Railway).
