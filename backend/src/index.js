import 'dotenv/config'
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { cors } from 'hono/cors'
import { createSynthesisStream, isConfigured, INSIGHT_MODELS, MAIN_MODEL } from './aiService.js'

const app = new Hono()

const ALLOWED_ORIGINS = ['http://localhost:5173', 'https://unxai.vercel.app']

const corsHeaders = (origin) => ({
  'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[1],
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
})

app.use('*', cors({ origin: ALLOWED_ORIGINS, allowMethods: ['GET', 'POST', 'OPTIONS'], allowHeaders: ['Content-Type'] }))

// Handle preflight for the streaming route
app.options('/api/chat', (c) => {
  return new Response(null, { status: 204, headers: corsHeaders(c.req.header('origin') || '') })
})

app.post('/api/chat', async (c) => {
  const origin = c.req.header('origin') || ''

  if (!isConfigured()) return c.json({ error: 'OPENROUTER_API_KEY not configured' }, 500)

  let body
  try { body = await c.req.json() }
  catch { return c.json({ error: 'Invalid JSON body' }, 400) }

  const { message } = body
  if (!message || message.trim() === '') return c.json({ error: 'Message cannot be empty' }, 400)

  const referer = process.env.HTTP_REFERER || origin || 'https://unxai.vercel.app'
  const stream = createSynthesisStream(message.trim(), process.env.OPENROUTER_API_KEY, referer)

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      ...corsHeaders(origin)
    }
  })
})

app.get('/api/models', (c) => c.json({ insightModels: INSIGHT_MODELS, mainModel: MAIN_MODEL, available: isConfigured() }))
app.get('/health', (c) => c.json({ status: 'ok', configured: isConfigured() }))
app.get('/', (c) => c.json({ message: 'OneAI Backend — 3-Model Pipeline', endpoints: { health: 'GET /health', chat: 'POST /api/chat', models: 'GET /api/models' } }))

serve({ fetch: app.fetch, port: process.env.PORT || 3001 }, () => {
  console.log('🚀 Server running on http://localhost:3001')
  if (!isConfigured()) console.warn('⚠️  OPENROUTER_API_KEY is not set')
})