import { Auth0Client } from "@auth0/nextjs-auth0/server";

/**
 * Auth0 SDK v4 client singleton. Reads configuration from env vars:
 *   AUTH0_SECRET, AUTH0_DOMAIN, AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET, APP_BASE_URL.
 *
 * The v4 SDK auto-mounts /auth/login, /auth/logout, /auth/callback,
 * /auth/profile, /auth/access-token, /auth/backchannel-logout via
 * `auth0.middleware(request)` in src/middleware.ts. No Route Handler needed.
 */
export const auth0 = new Auth0Client();
