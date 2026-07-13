# Anchor

A neuro-inclusive capture → age → act app for professionals with ADHD. PRD v1.2, implemented in full: quick capture, the ageing system with Simmering, Focus Mode with a resilient timer, the Dopamine Menu with hard-limit Desserts, recurring tasks, the Insights screen, offline-first sync across devices, and the daily Ageing Digest over Web Push.

## Architecture

```
Angular 19 PWA (GitHub Pages) ──HTTPS──▶ Spring Boot 3 API (Docker, any host) ──JDBC──▶ Supabase Postgres
        │                                        ▲
        └── Google sign-in via Supabase Auth ────┘   (API validates Supabase JWTs)
```

The frontend is fully static, so GitHub Pages serves it; installed from Chrome via Add to Home Screen it behaves like a native Android app. The API is one container you can run on Railway, Render, Fly.io, or any VPS. Supabase provides both the Postgres database and Google authentication, so there is no password handling anywhere in this codebase.

- `frontend/` — Angular 19 + TypeScript PWA. Hash routing (Pages-safe), Angular service worker, IndexedDB offline write queue, 30-second delta sync, Web Push subscription.
- `backend/` — Java 21 / Spring Boot 3.4. Hibernate/JPA on Postgres, Flyway migrations, Supabase JWT resource server, last-write-wins guard, recurrence engine, Ageing Digest scheduler with VAPID Web Push.
- `.github/workflows/deploy-pages.yml` — builds and publishes the frontend to GitHub Pages on every push to `main`.

## 1. Supabase setup (one time)

1. Create a project at supabase.com. Note the **Project URL** (`https://<ref>.supabase.co`) and the **anon key** (Settings → API).
2. Enable Google sign-in: Authentication → Providers → Google. Create an OAuth client in Google Cloud Console (type: Web application), set the authorised redirect URI to `https://<ref>.supabase.co/auth/v1/callback`, and paste the client ID/secret into Supabase.
3. Add your app URLs to Authentication → URL Configuration → Redirect URLs:
   - `http://localhost:4200` (dev)
   - `https://<your-github-username>.github.io/<repo>/` (prod)
4. Database credentials: Settings → Database. Use the **Session pooler** connection string. The JDBC form is
   `jdbc:postgresql://<pooler-host>:5432/postgres?sslmode=require` with the given user and password.
5. JWT verification, either of:
   - **Legacy secret (HS256):** Settings → API → JWT Secret → set it as `SUPABASE_JWT_SECRET` on the API.
   - **Signing keys (RS256/ES256):** leave `SUPABASE_JWT_SECRET` empty; the API fetches `<SUPABASE_URL>/auth/v1/.well-known/jwks.json` automatically.

## 2. VAPID keys for the Ageing Digest (one time)

```bash
npx web-push generate-vapid-keys
```

Keep the private key on the API only. The public key goes to both the API and the frontend build.

## 3. Backend deployment

The API is a single Docker image:

```bash
cd backend && docker build -t anchor-api .
```

Run it anywhere with these environment variables:

| Variable | Value |
|---|---|
| `DB_URL` | `jdbc:postgresql://<supabase-pooler-host>:5432/postgres?sslmode=require` |
| `DB_USER` / `DB_PASSWORD` | Supabase database credentials |
| `SUPABASE_URL` | `https://<ref>.supabase.co` |
| `SUPABASE_JWT_SECRET` | JWT secret, or empty to use JWKS |
| `CORS_ORIGINS` | `https://<user>.github.io` (comma-separate extras, e.g. `http://localhost:4200`) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | from step 2 |
| `VAPID_SUBJECT` | `mailto:you@example.com` |

Flyway creates the schema on first boot. Health check: `GET /actuator/health`. On Railway/Render, point the service at `backend/` and the Dockerfile is picked up automatically; note the public URL, it becomes `API_URL` below.

## 4. Frontend on GitHub Pages

1. Push this repository to GitHub. In the repo: Settings → Pages → Source: **GitHub Actions**.
2. Add repository secrets (Settings → Secrets and variables → Actions):
   - `API_URL` — public URL of the deployed API, no trailing slash
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY`
   - `VAPID_PUBLIC_KEY`
3. Push to `main`. The workflow builds with the right `--base-href` and deploys. The app lands at `https://<user>.github.io/<repo>/`.
4. On Android: open that URL in Chrome → menu → **Add to Home Screen**. Full-screen, own icon, offline capture, push notifications; no APK involved.

## 5. Local development

```bash
docker compose up db          # local Postgres on 5432
cd backend && mvn spring-boot:run
cd frontend && npm install && npm start   # http://localhost:4200, /api proxied to 8080
```

Sign-in against a real Supabase project also works locally: put your project values into `frontend/src/environments/environment.ts` and set `SUPABASE_URL`(+secret) on the backend.

`docker compose up` builds and runs the API too if you prefer everything containerised.

## Behavioural notes

- **Ageing** is computed client-side from `captured_at`/`last_acted_at`; only meaningful progress (step done, focus session finished, status change) resets it. A task with a future due date does not age: scheduled is not stale.
- **Offline**: every write that fails on the network is queued in IndexedDB and replayed in order on reconnect. Stale replays are rejected by the server's last-write-wins guard (HTTP 409) and repaired by delta sync. Capture works with zero network, always.
- **Recurring tasks**: completing one keeps the done row and spawns the next instance server-side (steps reset, due date advanced; late completions still land in the future).
- **The digest** is at most one notification per local day, sent only if a task crossed the 7- or 14-day threshold in the previous 24 hours. Enabling it in Settings is the only permission prompt in the app. Dead subscriptions are pruned automatically.
- **Menu editing** uses an explicit Edit mode rather than swipe-to-delete: on the web platform swipe gestures conflict with scroll, so the PRD's swipe affordance maps to Edit → Delete.
- **Account deletion** wipes all application data via cascading deletes; the Google identity itself lives in Supabase Auth and is removed from its dashboard.

## Tests

```bash
cd backend && mvn test
```

Covers the recurrence engine (weekday skips, end-of-month clamping, late completions). The build also compiles with `ddl-auto: validate`, so Flyway schema and JPA mappings are checked against each other at startup.
