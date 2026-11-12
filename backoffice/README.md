# MJPhotography private back office — stage 2

## Current status

The Supabase project is connected and the private schema/storage migration has been
applied and verified. The sole owner Auth account is created and linked;
**real email sign-in, cloud uploads and cloud saves are not active or tested yet**.
The back-office website is not deployed. No photographs have been uploaded.
The existing local editor at port 4173 and the public photography site remain unchanged.
The new backend preview is http://127.0.0.1:4174/login.html while its local process runs.
It displays a connection-pending notice and does not offer a fake sign-in button.

The owner account UUID is enrolled through the trusted admin connection. The next
owner action is to configure the exact callback address in Supabase URL Configuration.
Server configuration remains local and outside the repository.
Do not send passwords, one-time codes or service-role keys into chat.

## Implemented behavior

- Email sign-in links through Supabase Auth with shouldCreateUser=false and PKCE.
  The PKCE verifier stays in a separate server-memory store per sign-in attempt.
  A short-lived HttpOnly SameSite=Lax cookie binds the callback to the initiating browser;
  callbacks expire after ten minutes and are single-use. The resulting session cookie
  remains SameSite=Strict. Cross-site navigation is allowed only for the public sign-in
  page and callback; private endpoints remain protected.
  No registration route exists. Access requires the configured auth UUID, plus the
  database owner allowlist; an email address alone does not authorize data access.
- The backend verifies the Supabase user and database authorization on protected
  requests. Tokens stay in server memory, never browser localStorage or IndexedDB.
  The browser receives a random HttpOnly, SameSite=Strict session cookie.
  Production cookies require HTTPS and use the __Host- prefix.
- Absolute sessions last eight hours and idle sessions expire after thirty minutes.
  Background probes do not renew idle time. Server restart signs everyone out.
  This version uses one server instance; shared session storage is needed before
  running multiple instances. In-memory throttles also apply per server.
- Sign-out revokes the local server session immediately. If upstream logout fails,
  the local cookie/session still cannot be reused.
- Private drafts use Supabase Postgres with owner-only row-level security.
  Atomic revision checks reject simultaneous-tab overwrites.
- Photos upload through the authenticated server to an immutable private Storage bucket.
  Original files remain private. Sharp validates actual image decoding and rejects
  unsupported or oversized images. Previews normalize EXIF orientation, remove metadata
  including EXIF GPS, retain the complete frame, and fit inside 2400px without upscaling.
  Both original and preview storage plus metadata registration must succeed before
  the interface confirms an upload.
- Photo previews are streamed through authenticated API routes. The browser never
  receives public storage URLs or signed URL bearer tokens. Protected responses use
  no-store. CSRF/origin and host checks, a restrictive CSP, upload/request limits and
  login attempt limits are included.
- Session expiration locks the editor without saving or discarding unsaved edits.
  Sign in in a second tab and Resume editing to recover the open editing session.
- Publish remains disabled. No release generation, public bucket, deployment hook,
  production GitHub token, billing action or automatic publication is present.

## Activation steps for the developer after account connection

1. Create a dedicated owner-controlled Supabase project; verify the selected plan
   and any costs with the owner before committing to a paid subscription.
2. Create the owner's Auth user with the owner's confirmed email. Turn off public
   sign-ups. Confirm possession of that email during the first actual code sign-in.
   Record the Auth UUID as the owner ID; do not derive ownership from email claims.
3. Keep the default email sign-in link template. No template editing or custom SMTP
   is required for the initial owner test. Set Site URL to the exact private app origin
   and add that origin plus /auth/callback to the allowed redirect URLs. Test real
   email delivery and open the latest link in the same browser that requested it.
   Supabase default mail restricts recipients and rate limits; if the owner address
   is not permitted, stop and choose a reviewed delivery setup. Do not claim delivery
   until it succeeds.
4. Review and apply supabase/001_private_portfolio.sql to the dedicated project.
   This is a one-time numbered migration, not a rerunnable setup script.
   Verify existing Storage policies before applying; a dedicated bucket/project
   avoids interactions with broad policies from other applications.
5. Add only the owner's auth UUID to portfolio_private.owners through the trusted
   admin/SQL connection. This table is inaccessible to the browser and public roles.
6. Copy .env.example to a local/server-only .env, provide the project HTTPS URL,
   sb_publishable_ key, owner UUID and owner email. No service-role key is used.
   Keep .env outside GitHub artifacts. Use Node 22 or newer, install from the lockfile,
   and start the backend from this directory:

       pnpm install --frozen-lockfile
       pnpm start

   SITE_ROOT normally points to the repository root (..). For this desktop output
   bundle, use SITE_ROOT=../../portfolio-manager-stage1.
7. Validate real email-link login, unauthorized/other-user access directly against hosted
   Supabase APIs, token refresh, logout/revocation, image upload, draft reload, expired
   sessions and multi-tab conflicts. Compare Storage bucket privacy and RLS grants.
   Confirm no private content is publicly retrievable.
8. Prepare a separate HTTPS Node host and staging hostname. The public site remains
   on GitHub Pages; GitHub Pages cannot run this private backend. Configure APP_ORIGIN
   to that exact HTTPS origin and HOST for the chosen host. Use only one instance
   until session and rate-limit storage are externalized. Obtain owner approval
   before deploying or changing DNS/production settings.
9. Publishing and MFA for publishing are a later stage. The server has no Publish API.
   Add MFA and release audit/rollback before enabling live portfolio changes.

The existing browser-only draft is intentionally not silently uploaded or migrated.
Its editor and IndexedDB data remain at port 4173. A reviewed import can be added once
the real private service is connected. Do not overwrite existing drafts during setup.

## Tests and limits

Run: node --test test/*.test.mjs

Twenty tests passed locally, including the updated private-function wrappers:

- anonymous/forged sessions blocked from drafts, photos and private HTML;
- owner UUID and database allowlist checks, revocation, logout and idle timeout;
- HttpOnly/Secure cookie behavior, CSRF/origin/host checks, login throttling;
- invalid photo references, oversize upload rejection, save conflict behavior;
- real Sharp EXIF orientation/metadata removal and complete aspect ratio;
- real PostgreSQL execution of the migration using PGlite with minimal Supabase
  Auth/Storage schema shims: anonymous/other-user isolation, owner enrollment protection,
  Storage folder policies, immutable permissions and atomic revision conflicts.

The PostgreSQL tests are not hosted Supabase integration tests. Remote Auth, SMTP,
Storage, RLS configuration and refresh-token behavior still require the actual account.
The original pending-connection browser test verified that requesting /manager.html without sign-in redirects to the
connection-pending sign-in page. No fake authenticated browser preview is exposed.

Hosted verification after applying the migration: private bucket flag is false; all
three tables have RLS enabled; anonymous read/save grants are absent; direct client
draft updates are denied. A transaction using the authenticated role and an unapproved
UUID returned no drafts/assets, failed the owner check and was denied a draft save.
No Auth users were fabricated in SQL. Public RPC wrappers are SECURITY INVOKER;
privileged helpers live in the unexposed portfolio_private schema and check auth.uid().

Advisors report no security warnings. Informational findings are expected: the private
owners table deliberately has no client RLS policy/grants (only trusted admin enrollment),
and the owner lookup index is unused before the application receives data.
References: [deny-by-default RLS](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy),
[unused index guidance](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).

Failed/interrupted multi-object uploads can leave private unreferenced files; they do
not appear as saved draft items. Add a reviewed recovery/retention process before heavy
use. No destructive cleanup is performed automatically.

## Primary references

- [Supabase passwordless sign-in](https://supabase.com/docs/guides/auth/auth-email-passwordless)
- [Server verification with getUser](https://supabase.com/docs/reference/javascript/auth-getuser)
- [Row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Storage access control](https://supabase.com/docs/guides/storage/security/access-control)
- [Sharp output and metadata defaults](https://sharp.pixelplumbing.com/api-output/)

The email-link adaptation also tests the official Supabase SDK with intercepted network
responses: separate per-attempt PKCE challenges, server-only verifier storage, code
exchange and redirect binding. These are protocol tests, not a real delivered-email
sign-in. Hosted callback allowlisting and owner browser testing remain outstanding.
