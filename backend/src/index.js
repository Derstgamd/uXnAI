import 'dotenv/config'
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { cors } from 'hono/cors'
import { createSynthesisStream, isConfigured, INSIGHT_MODELS, MAIN_MODEL } from './aiService.js'
import auth, { requireAuth } from './auth.js'

const app = new Hono()

const ALLOWED_ORIGINS = ['http://localhost:5173', 'https://unxai.vercel.app', 'http://127.0.0.1:5173']

const corsHeaders = (origin) => ({
  'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[1],
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Credentials': 'true',
})

app.use('*', cors({
  origin: ALLOWED_ORIGINS,
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
  credentials: true,
}))

// Preflight for streaming route
app.options('/api/chat', (c) => {
  return new Response(null, { status: 204, headers: corsHeaders(c.req.header('origin') || '') })
})

// ── Auth routes ───────────────────────────────────────────────────────────────
// POST /auth/register
// POST /auth/login
// POST /auth/logout
// GET  /auth/me
// GET  /auth/google
// GET  /auth/google/callback
app.route('/auth', auth)

// ── Protected chat endpoint ───────────────────────────────────────────────────
app.post('/api/chat', requireAuth, async (c) => {
  if (!isConfigured()) return c.json({ error: 'OPENROUTER_API_KEY not configured' }, 500)

  let body
  try { body = await c.req.json() }
  catch { return c.json({ error: 'Invalid JSON body' }, 400) }

  const { message } = body
  if (!message || message.trim() === '') return c.json({ error: 'Message cannot be empty' }, 400)

  const origin = c.req.header('origin') || ''
  const referer = process.env.HTTP_REFERER || origin || 'https://unxai.vercel.app'
  const stream = createSynthesisStream(message.trim(), process.env.OPENROUTER_API_KEY, referer)

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      ...corsHeaders(origin),
    }
  })
})

// ── Public routes ─────────────────────────────────────────────────────────────
app.get('/api/models', (c) => c.json({
  insightModels: INSIGHT_MODELS,
  mainModel: MAIN_MODEL,
  available: isConfigured()
}))

app.get('/health', (c) => c.json({ status: 'ok', configured: isConfigured() }))

app.get('/', (c) => c.json({
  message: 'OneAI Backend — 3-Model Pipeline',
  endpoints: {
    health: 'GET /health',
    chat: 'POST /api/chat (auth required)',
    models: 'GET /api/models',
    auth: {
      register: 'POST /auth/register',
      login: 'POST /auth/login',
      logout: 'POST /auth/logout',
      me: 'GET /auth/me',
      google: 'GET /auth/google',
      googleCallback: 'GET /auth/google/callback',
    }
  }
}))

serve({ fetch: app.fetch, port: process.env.PORT || 3001 }, () => {
  console.log('🚀 Server running on http://localhost:3001')
  if (!isConfigured()) console.warn('⚠️  OPENROUTER_API_KEY is not set')
})