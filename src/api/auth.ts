// Auth API routes - uses Cloudflare Access for authentication
import { Hono } from 'hono';
import type { Env } from '../types/env';

const auth = new Hono<{ Bindings: Env }>();

// GET /api/auth/me - Get current user
// When protected by Cloudflare Access, reads Cf-Access-Authenticated-User-Email header
// For local dev, falls back to dev-login cookie
auth.get('/me', async (c) => {
  // Check for Cloudflare Access header (production)
  const accessEmail = c.req.header('Cf-Access-Authenticated-User-Email');

  // Check for dev cookie (local development)
  const cookies = c.req.header('Cookie') || '';
  const devEmailMatch = cookies.match(/dev_user_email=([^;]+)/);
  const devEmail = devEmailMatch ? decodeURIComponent(devEmailMatch[1]) : null;

  const email = accessEmail || devEmail;

  if (!email) {
    return c.json({ data: null, error: null }); // Not logged in, but not an error
  }

  // Return user data (no database needed for now - just return email-based user)
  const user = {
    id: email,
    email,
    display_name: email.split('@')[0],
    avatar_url: null,
  };

  return c.json({ data: user, error: null });
});

// GET /api/auth/dev-login - Development-only login (sets a cookie)
auth.get('/dev-login', async (c) => {
  // Check if the request is from a local IP address
  // In wrangler dev, CF-Connecting-IP is set to ::1 or 127.0.0.1
  // In production, it's a real public IP
  const cfConnectingIp = c.req.header('CF-Connecting-IP') || '';
  const isLocalIp = cfConnectingIp === '::1' ||
                    cfConnectingIp === '127.0.0.1' ||
                    cfConnectingIp.startsWith('192.168.') ||
                    cfConnectingIp.startsWith('10.') ||
                    cfConnectingIp.startsWith('172.16.') ||
                    cfConnectingIp === '';

  if (!isLocalIp) {
    return c.json({
      data: null,
      error: { message: 'Not available in production', code: 'NOT_FOUND' }
    }, 404);
  }

  const email = c.req.query('email') || 'dev@localhost';

  // Set a simple cookie for dev
  const cookie = `dev_user_email=${encodeURIComponent(email)}; Path=/; HttpOnly; SameSite=Lax`;

  return new Response(null, {
    status: 302,
    headers: {
      'Location': '/',
      'Set-Cookie': cookie,
    },
  });
});

// POST /api/auth/logout - Clear session
auth.post('/logout', (c) => {
  // Clear dev cookie
  const clearCookie = 'dev_user_email=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';

  // For Cloudflare Access, user would need to go to Access logout URL
  // But clearing the dev cookie handles local dev
  c.header('Set-Cookie', clearCookie);
  return c.json({ data: { success: true }, error: null });
});

export default auth;
