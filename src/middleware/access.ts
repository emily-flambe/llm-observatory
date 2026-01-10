import { createMiddleware } from 'hono/factory';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Env } from '../types/env';

type Variables = {
  userEmail?: string;
};

/**
 * Cloudflare Access JWT validation middleware.
 *
 * Validates the CF-Access-JWT-Assertion header against your Access application.
 * In development (when CF_ACCESS_TEAM_DOMAIN is not set), requests pass through.
 */
export const requireAccess = createMiddleware<{ Bindings: Env; Variables: Variables }>(async (c, next) => {
  // Skip validation in development if Access is not configured
  if (!c.env.CF_ACCESS_TEAM_DOMAIN || !c.env.CF_ACCESS_AUD) {
    console.log('Access middleware: Skipping validation (not configured)');
    return next();
  }

  const token = c.req.header('cf-access-jwt-assertion');

  if (!token) {
    return c.json({ error: 'Missing Access token' }, 401);
  }

  try {
    const jwksUrl = new URL(`${c.env.CF_ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`);
    const JWKS = createRemoteJWKSet(jwksUrl);

    const { payload } = await jwtVerify(token, JWKS, {
      issuer: c.env.CF_ACCESS_TEAM_DOMAIN,
      audience: c.env.CF_ACCESS_AUD,
    });

    // Add user email to context for logging/audit
    c.set('userEmail', payload.email as string | undefined);

    return next();
  } catch (err) {
    console.error('Access JWT validation failed:', err);
    return c.json({ error: 'Invalid Access token' }, 403);
  }
});
