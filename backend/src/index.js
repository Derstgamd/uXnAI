import 'dotenv/config'
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { cors } from 'hono/cors'
import { createSynthesisStream, isConfigured, INSIGHT_MODELS, MAIN_MODEL } from './aiService.js'

const app = new Hono()

app.use('*', cors({
  origin: process.env.CORS_ORIGIN || 'https://unxai.vercel.app',
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type']
}))

/**
 * POST /api/chat
 * Gathers insights from 2 models concurrently, then streams the
 * synthesised response from the main model back as SSE.
 * Body: { "message": "user input text" }
 */
app.post('/api/chat', async (c) => {
  if (!isConfigured()) {
    return c.json({ error: 'OPENROUTER_API_KEY not configured' }, 500)
  }

  let body
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  const { message } = body

  if (!message || message.trim() === '') {
    return c.json({ error: 'Message cannot be empty' }, 400)
  }

  const referer = process.env.HTTP_REFERER || c.req.header('origin') || 'https://unxai.vercel.app'
  const stream = createSynthesisStream(message.trim(), process.env.OPENROUTER_API_KEY, referer)

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    }
  })
})

/**
 * GET /api/models
 * Returns the models used in the pipeline
 */
app.get('/api/models', (c) => {
  return c.json({
    insightModels: INSIGHT_MODELS,
    mainModel: MAIN_MODEL,
    available: isConfigured()
  })
})

/**
 * GET /health
 */
app.get('/health', (c) => c.json({ status: 'ok', configured: isConfigured() }))

/**
 * GET /
 */
app.get('/', (c) =>
  c.json({
    message: 'OneAI Backend — 3-Model Pipeline',
    endpoints: {
      health: 'GET /health',
      chat: 'POST /api/chat',
      models: 'GET /api/models'
    }
  })
)

serve({ fetch: app.fetch, port: process.env.PORT || 3001 }, () => {
  console.log('🚀 Server running on http://localhost:3001')
  if (!isConfigured()) console.warn('⚠️  OPENROUTER_API_KEY is not set')
})