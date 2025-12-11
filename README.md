# My Class (Cloudflare Worker)

This Worker powers the My Class SaaS masterclass site. It serves a React front end, handles exam APIs, and stores data in Cloudflare D1 and images in R2. This README documents the safety practices and coding steps that keep builds reliable and make it easy for future contributors to work with Cloudflare.

## Architecture
- **Entry point:** `src/index.js` routes `/api/*` requests to the API layer and all other paths to the HTML shell. It also proxies `/img/*` to R2 with long-lived caching.
- **Data:** Cloudflare D1 for users, students, exams, questions, and attempts. Tables are initialized by `/api/system/init` and can be reset with `/api/system/reset`.
- **Storage:** Cloudflare R2 bucket bound as `BUCKET` for uploaded images.
- **Security helpers:** Centralized in `src/security.js` for password hashing (PBKDF2) and JWT-based auth.
- **Headers:** `src/headers.js` adds security headers (CSP, X-Frame-Options, etc.) to every response.

## Cloudflare setup
1. **Bindings** (configured in `wrangler.toml`):
   - `DB`: D1 database named `exam` (ID `014fb844-bc51-4b66-850a-0a2a04e4506b`).
   - `BUCKET`: R2 bucket named `exam`.
2. **Compatibility date:** `2024-03-20` to match Workers runtime features.
3. **Secrets & environment:**
   - Set `JWT_SECRET` in `src/security.js` to a long, random value before deployment.
   - Add any additional secrets (e.g., third-party API keys) via `wrangler secret put`.
4. **Deploy:** `npm install` (if dependencies are added) then `npx wrangler publish`. Use `npx wrangler dev --remote` to test against Cloudflare services.

## Safety steps
- **Secure headers:** Every response passes through `addSecureHeaders`, which injects CSP, X-Frame-Options, X-Content-Type-Options, and Referrer-Policy to harden the app.
- **JWT auth:** API routes call `verifyJwt` via a shared `requireAuth` helper to enforce roles (teacher vs. super_admin) and expiry.
- **Password hashing:** User passwords are salted and hashed with PBKDF2 (100k iterations) and verified with matching helper functions.
- **Database hygiene:** Reset/init endpoints wrap table creation and cleanup in `env.DB.batch` calls to keep schema consistent across deployments.
- **R2 access:** Image fetches validate keys and return 404s for missing objects; metadata and long cache headers are forwarded to browsers.
- **Front-end resilience:** The HTML shell includes an Error Boundary and toast notifications to recover gracefully from runtime issues.
- **Content Security Policy:** CSP is set to allow required CDNs and Worker-hosted assets while restricting other sources.

## Coding steps and conventions
- **Routing:** Keep all API routes inside `handleApi` and gate them with `requireAuth` where needed. Non-API requests should end with `getHtml()` wrapped in `addSecureHeaders`.
- **Database access:** Use prepared statements (`env.DB.prepare(...).bind(...)`) and batch operations for schema changes. When adding tables/columns, include idempotent `CREATE TABLE IF NOT EXISTS`/`ALTER TABLE` blocks.
- **Auth-aware features:** For role-specific endpoints, check roles early and return `401/403` JSON errors to keep the front end predictable.
- **Payload handling:** `apiFetch` defaults to JSON but drops the `Content-Type` header when sending `FormData` so the browser sets multipart boundaries correctly.
- **Build stability:** Avoid unescaped backticks in template strings inside JSX/Babel scripts. A previous build error was resolved by escaping backticks in fetch URLs inside the inlined editor script; keep that pattern when editing `src/html.js`.
- **Static assets:** Serve images through `/img/{key}` so R2 metadata and caching are preserved; do not link directly to R2 bucket URLs.
- **Testing locally:** Use `npx wrangler dev --remote` to exercise D1 and R2. For CSP debugging, check response headers via `curl -I` to confirm policies are applied.

## Common workflows
- **First-time setup:**
  1. `npx wrangler d1 execute exam --local --file schema.sql` (optional) or call `/api/system/init` to create tables.
  2. POST to `/api/auth/setup-admin` with `{ username, password, name }` to create the first super admin.
  3. Log in, create teachers, and start adding exams via the UI.
- **Resetting the environment:** POST to `/api/system/reset` (super_admin only) to drop and recreate all tables. Re-run setup steps afterward.
- **Managing config options:** Use `/api/config/*` endpoints to add/delete school configuration entries.
- **Handling images:** Upload to R2 via the front end; fetch via `/img/{key}`. Cached responses include `etag` and `Cache-Control` headers.

## Troubleshooting
- **Build errors involving template literals:** Check for stray backticks in inlined JSX/Babel scripts and escape them with `\`` when nested in template strings.
- **Auth issues:** Verify `JWT_SECRET` is set and that tokens include `Bearer` prefix in the `Authorization` header.
- **Database errors in dev:** If D1 schema drifts, call `/api/system/reset` and `/api/system/init` to rebuild tables, or inspect with `wrangler d1 execute`.

