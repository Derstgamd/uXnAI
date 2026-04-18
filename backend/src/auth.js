import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import argon2 from 'argon2'
import { SignJWT, jwtVerify } from 'jose'
import { db } from './db/client.js'
import { users, sessions } from './db/schema.js'

const auth = new Hono()

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET)
const COOKIE_NAME = 'uxnai_session'
const SESSION_DAYS = 30

// ── In-memory rate limiter ────────────────────────────────────────────────────
const rateLimitStore = new Map()

function rateLimit(key, maxAttempts, windowMs) {
  const now = Date.now()
  const entry = rateLimitStore.get(key)

  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, remaining: maxAttempts - 1 }
  }

  if (entry.count >= maxAttempts) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000)
    return { allowed: false, retryAfter }
  }

  entry.count++
  return { allowed: true, remaining: maxAttempts - entry.count }
}

setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetAt) rateLimitStore.delete(key)
  }
}, 10 * 60 * 1000)

function getIp(c) {
  return (
    c.req.header('x-forwarded-for')?.split(',')[0].trim() ||
    c.req.header('x-real-ip') ||
    'unknown'
  )
}

// ── Input sanitization helpers ────────────────────────────────────────────────

function sanitizeEmail(raw) {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)) return null
  if (trimmed.length > 254) return null
  return trimmed
}

function sanitizePassword(raw) {
  if (typeof raw !== 'string') return null
  if (raw.length < 8 || raw.length > 128) return null
  return raw
}

// ── JWT / Cookie helpers ──────────────────────────────────────────────────────

async function signToken(payload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(JWT_SECRET)
}

async function verifyToken(token) {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
    return payload
  } catch {
    return null
  }
}

function setSessionCookie(c, token) {
  const isProduction = process.env.NODE_ENV === 'production'
  const sameSite = isProduction ? 'None' : 'Lax'
  const secure = isProduction ? '; Secure' : ''
  
  c.header(
    'Set-Cookie',
    `${COOKIE_NAME}=${token}; HttpOnly; SameSite=${sameSite}; Path=/; Max-Age=${60 * 60 * 24 * SESSION_DAYS}${secure}`
  )
}

function clearSessionCookie(c) {
  const isProduction = process.env.NODE_ENV === 'production'
  const sameSite = isProduction ? 'None' : 'Lax'
  const secure = isProduction ? '; Secure' : ''
  
  c.header('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; SameSite=${sameSite}; Path=/; Max-Age=0${secure}`)
}

async function createSession(userId) {
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000)
  const [session] = await db
    .insert(sessions)
    .values({ userId, expiresAt })
    .returning()
  return session
}

function getTokenFromCookie(c) {
  const cookie = c.req.header('cookie') || ''
  return cookie
    .split(';')
    .find(s => s.trim().startsWith(`${COOKIE_NAME}=`))
    ?.split('=')[1]
    ?.trim() || null
}

// ── POST /auth/register ───────────────────────────────────────────────────────
auth.post('/register', async (c) => {
  const ip = getIp(c)
  const rl = rateLimit(`register:${ip}`, 5, 15 * 60 * 1000)
  if (!rl.allowed) {
    return c.json({ error: `Too many attempts. Try again in ${rl.retryAfter}s` }, 429)
  }

  let body
  try { body = await c.req.json() } catch {
    return c.json({ error: 'Invalid request body' }, 400)
  }

  const email = sanitizeEmail(body.email)
  const password = sanitizePassword(body.password)

  if (!email) return c.json({ error: 'Invalid email address' }, 400)
  if (!password) return c.json({ error: 'Password must be 8–128 characters' }, 400)

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
  if (existing.length) return c.json({ error: 'Email already in use' }, 409)

  // Use Argon2 for hashing
  const passwordHash = await argon2.hash(password)

  const [user] = await db
    .insert(users)
    .values({ email, passwordHash, isAnon: false })
    .returning({ id: users.id, email: users.email, subscriptionTier: users.subscriptionTier })

  const session = await createSession(user.id)
  const token = await signToken({ sub: user.id, sessionId: session.id })
  setSessionCookie(c, token)

  return c.json({ user }, 201)
})

// ── POST /auth/login ──────────────────────────────────────────────────────────
auth.post('/login', async (c) => {
  const ip = getIp(c)
  const rl = rateLimit(`login:${ip}`, 10, 15 * 60 * 1000)
  if (!rl.allowed) {
    return c.json({ error: `Too many attempts. Try again in ${rl.retryAfter}s` }, 429)
  }

  let body
  try { body = await c.req.json() } catch {
    return c.json({ error: 'Invalid request body' }, 400)
  }

  const email = sanitizeEmail(body.email)
  const password = typeof body.password === 'string' ? body.password : null

  if (!email || !password) return c.json({ error: 'Invalid email or password' }, 401)

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1)

  let valid = false
  if (user && user.passwordHash) {
    valid = await argon2.verify(user.passwordHash, password)
  } else {
    // Timing attack protection: hash even if user doesn't exist
    await argon2.verify("$argon2id$v=19$m=65536,t=3,p=4$dummyhash", "dummypassword")
  }

  if (!user || !valid) {
    return c.json({ error: 'Invalid email or password' }, 401)
  }

  const session = await createSession(user.id)
  const token = await signToken({ sub: user.id, sessionId: session.id })
  setSessionCookie(c, token)

  return c.json({
    user: { id: user.id, email: user.email, subscriptionTier: user.subscriptionTier }
  })
})

// ── OAuth Handlers (Google) ───────────────────────────────────────────────────
auth.get('/google', (c) => {
  const ip = getIp(c)
  const rl = rateLimit(`google:${ip}`, 20, 60 * 60 * 1000)
  if (!rl.allowed) return c.json({ error: 'Too many requests' }, 429)

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'select_account',
  })
  return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
})

auth.get('/google/callback', async (c) => {
  const code = c.req.query('code')
  const error = c.req.query('error')
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'

  if (error || !code) return c.redirect(`${frontendUrl}?auth_error=google_denied`)

  if (typeof code !== 'string' || code.length > 512 || !/^[\w\-./]+$/.test(code)) {
    return c.redirect(`${frontendUrl}?auth_error=invalid_code`)
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    })

    const tokenData = await tokenRes.json()
    if (!tokenData.access_token) return c.redirect(`${frontendUrl}?auth_error=token_exchange`)

    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    })
    const googleUser = await userRes.json()

    if (!googleUser.id || !googleUser.email) return c.redirect(`${frontendUrl}?auth_error=no_profile`)

    const email = sanitizeEmail(googleUser.email)
    if (!email) return c.redirect(`${frontendUrl}?auth_error=invalid_email`)

    let user
    const byGoogleId = await db.select().from(users).where(eq(users.googleId, googleUser.id)).limit(1)

    if (byGoogleId.length) {
      user = byGoogleId[0]
    } else {
      const byEmail = await db.select().from(users).where(eq(users.email, email)).limit(1)
      if (byEmail.length) {
        const [updated] = await db
          .update(users)
          .set({ googleId: googleUser.id })
          .where(eq(users.id, byEmail[0].id))
          .returning()
        user = updated
      } else {
        const [created] = await db
          .insert(users)
          .values({ email, googleId: googleUser.id, isAnon: false })
          .returning()
        user = created
      }
    }

    const session = await createSession(user.id)
    const token = await signToken({ sub: user.id, sessionId: session.id })
    setSessionCookie(c, token)
    return c.redirect(`${frontendUrl}?auth_success=1`)
  } catch (err) {
    console.error('[Google OAuth error]', err.message)
    return c.redirect(`${frontendUrl}?auth_error=server`)
  }
})

// ── GET /auth/me & POST /auth/logout ──────────────────────────────────────────
auth.get('/me', async (c) => {
  const token = getTokenFromCookie(c)
  if (!token) return c.json({ user: null }, 401)

  const payload = await verifyToken(token)
  if (!payload) return c.json({ user: null }, 401)

  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, payload.sessionId))
    .limit(1)

  if (!session || session.expiresAt < new Date()) {
    clearSessionCookie(c)
    return c.json({ user: null }, 401)
  }

  const [user] = await db
    .select({ id: users.id, email: users.email, subscriptionTier: users.subscriptionTier, isAnon: users.isAnon })
    .from(users)
    .where(eq(users.id, payload.sub))
    .limit(1)

  if (!user) return c.json({ user: null }, 401)
  return c.json({ user })
})

auth.post('/logout', async (c) => {
  const token = getTokenFromCookie(c)
  if (token) {
    const payload = await verifyToken(token)
    if (payload?.sessionId) {
      await db.delete(sessions).where(eq(sessions.id, payload.sessionId)).catch(() => {})
    }
  }
  clearSessionCookie(c)
  return c.json({ ok: true })
})

export default auth

// ── Middleware ────────────────────────────────────────────────────────────────
export async function requireAuth(c, next) {
  const ip = getIp(c)
  const rl = rateLimit(`api:${ip}`, 60, 60 * 1000)
  if (!rl.allowed) return c.json({ error: `Rate limit exceeded` }, 429)

  const token = getTokenFromCookie(c)
  if (!token) return c.json({ error: 'Unauthorised' }, 401)

  const payload = await verifyToken(token)
  if (!payload) return c.json({ error: 'Unauthorised' }, 401)

  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, payload.sessionId))
    .limit(1)

  if (!session || session.expiresAt < new Date()) {
    return c.json({ error: 'Session expired' }, 401)
  }

  c.set('userId', payload.sub)
  await next()
}