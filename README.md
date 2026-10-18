# at 1801

Where ideas become agreements. A product by Sandikala Studio, built on Astro 7, Vue 3 islands, Supabase PostgreSQL/Auth, and class-based CSS.

## Local setup

1. Copy `.env.example` to `.env` and fill it with values from the intended Supabase project's **Project Settings > API** page. Keep `SUPABASE_SERVICE_ROLE_KEY` server-only.
2. Review `supabase/migrations/202610180001_initial_schema.sql`. For a new, empty project, apply it once in the Supabase SQL Editor. The migration is not designed to be rerun after it succeeds.
3. Confirm the SQL Editor reports success, then verify the tables under **Database > Tables** and RLS under **Authentication > Policies**.
4. Create the authorized admin in **Authentication > Users**. Public registration is not part of this application.
5. Insert that user's Auth UUID and email into `public.profiles` using `supabase/seed.sql` as a guide. The same normalized email must appear in `ADMIN_EMAIL_ALLOWLIST`.
6. Run `npm install`, then `npm run dev`.

Required environment variables:

- `PUBLIC_SUPABASE_URL` — the HTTPS project URL.
- `PUBLIC_SUPABASE_ANON_KEY` — the publishable/anon key used for Auth.
- `SUPABASE_SERVICE_ROLE_KEY` — private server-only key used by protected Astro routes.
- `PROPOSAL_TOKEN_ENCRYPTION_KEY` — base64-encoded 32-byte AES key used only for recoverable proposal links.
- `ADMIN_EMAIL_ALLOWLIST` — comma-separated authorized admin emails.
- `PUBLIC_APP_URL` — the canonical application origin.

For a CLI-managed environment, link the existing project with `supabase link --project-ref <project-ref>`, review the migration, then use `supabase db push`. Do not apply the same migration through both the SQL Editor and the CLI.

The app uses the official Netlify adapter with Astro server output. Dynamic pages, middleware, and API routes are emitted for the Netlify Functions runtime.

## Structured proposal builder

`/proposals/new` and `/proposals/[id]/edit` share a six-section Vue builder. The form saves a draft to the existing `proposals.draft_document` JSONB column. New documents include an optional versioned `builder` object; legacy documents and immutable published snapshots remain readable. No database migration is required. Preview and public sharing render a structured document only when that snapshot includes `builder`.

Saving a new draft requires an existing or inline-created client because `proposals.client_id` is non-null. The rest of the proposal can be incomplete until publishing. `clients.email` is also non-null in the existing schema, so an omitted optional contact email is stored as an empty string; the public acceptance flow collects the client's email separately. Review this convention before integrating an external CRM that distinguishes null from an empty email.

The builder stores selected services, custom scope, timeline, pricing adjustments, milestones, and approved clause text in the proposal JSON snapshot. Server routes recalculate investment totals and validate publish readiness. Existing published versions, secure links, and acceptance records are not rewritten.

## Netlify deployment

1. Create a new Netlify site from this repository. Do not enable automatic production deploys until the deploy preview smoke tests pass.
2. Netlify reads the build command, publish directory, Node version, and baseline headers from `netlify.toml`.
3. Add every variable listed in `.env.example` under **Site configuration > Environment variables**. Set `PUBLIC_APP_URL` to `https://proposals.sandikala.studio`; mark private values as secrets and scope them to Functions and Builds.
4. Apply and verify the required Supabase migrations separately. The Netlify build does not modify the database.
5. Deploy to a preview context and test login, session refresh, logout, protected page/API rejection, proposal publication, public-link rendering, and proposal response submission against a staging Supabase project.
6. Add `proposals.sandikala.studio` in **Domain management**, create the DNS record Netlify requests, and wait for Netlify TLS provisioning before promoting the production deploy.

The Supabase Auth project should allow `https://proposals.sandikala.studio` as its site URL. Add the exact Netlify deploy-preview origins only if preview authentication is required. Cookies are HTTP-only, SameSite=Lax, and Secure in production builds.

## Security migration deployment

Before deploying the application version that includes security hardening, review and apply `supabase/migrations/202610180002_security_hardening.sql` in staging, then production. The migration adds transaction-backed publication and shared public-response rate limiting. The application intentionally does not fall back to non-atomic publishing if the migration is missing.

Generate `PROPOSAL_TOKEN_ENCRYPTION_KEY` once using a cryptographically secure generator, store the same value in each long-lived server environment, and back it up in the deployment secret manager. Rotating this key requires re-encrypting stored recoverable tokens first.

New proposal links are encrypted with AES-256-GCM. Existing 64-character plaintext tokens remain readable so current links are not invalidated. After deployment, run an explicitly approved application-level transition to encrypt legacy `encrypted_token` values, verify link recovery, and only then consider enforcing the encrypted `v1.` format. Do not attempt that transition in SQL because the application encryption key must not be stored in PostgreSQL.

## Security model

Confidential tables have RLS enabled with no browser-facing read policy. Authenticated allowlisted requests are verified in Astro middleware and all data access uses server routes. Public proposal access requires an expiring, revocable 256-bit token whose SHA-256 digest is used for lookup. The raw active token is retained in the protected server-only token table so an admin can copy the existing link; production deployments should encrypt this column with a managed application key. Published versions are immutable snapshots. Final client responses use row-locking PostgreSQL functions, and submission UUIDs prevent duplicates.

## Commands

- `npm run dev` — local server
- `npm run build` — production SSR build
- `npm test` — critical business-logic tests
- `npm run check` — Astro/TypeScript diagnostics
