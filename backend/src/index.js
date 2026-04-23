import 'dotenv/config'
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { cors } from 'hono/cors'
import { createSynthesisStream, createSynthesisStreamWithStorage, isConfigured, INSIGHT_MODELS, MAIN_MODEL } from './aiService.js'
import auth, { requireAuth } from './auth.js'
import { db } from './db/client.js'
import { users, conversations, messages } from './db/schema.js'
import { eq, desc } from 'drizzle-orm'

const app = new Hono()

const ALLOWED_ORIGINS = ['http://localhost:5173', 'https://uxnai.vercel.app', 'http://127.0.0.1:5173', 'https://uxnai.onrender.com']

const corsHeaders = (origin) => ({
  'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : 'https://uxnai.onrender.com',
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

// ── Conversation management endpoints ─────────────────────────────────────────
// POST /api/conversations - Create new conversation
app.post('/api/conversations', requireAuth, async (c) => {
  const user = c.get('user')
  const { title } = await c.req.json()
  
  const [conversation] = await db.insert(conversations).values({
    userId: user.id,
    title: title || 'New Conversation'
  }).returning()
  
  return c.json(conversation)
})

// GET /api/conversations - Get user's conversations
app.get('/api/conversations', requireAuth, async (c) => {
  const user = c.get('user')
  
  const userConversations = await db.select()
    .from(conversations)
    .where(eq(conversations.userId, user.id))
    .orderBy(desc(conversations.createdAt))
  
  return c.json(userConversations)
})

// GET /api/conversations/:id/messages - Get conversation history
app.get('/api/conversations/:id/messages', requireAuth, async (c) => {
  const user = c.get('user')
  const conversationId = c.req.param('id')
  
  // Verify conversation belongs to user
  const [conversation] = await db.select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
  
  if (!conversation || conversation.userId !== user.id) {
    return c.json({ error: 'Conversation not found' }, 404)
  }
  
  const conversationMessages = await db.select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(messages.createdAt)
  
  return c.json(conversationMessages)
})

// ── Protected chat endpoint ───────────────────────────────────────────────────
app.post('/api/chat', async (c) => {
  if (!isConfigured()) return c.json({ error: 'OPENROUTER_API_KEY not configured' }, 500)

  let body
  try { body = await c.req.json() }
  catch { return c.json({ error: 'Invalid JSON body' }, 400) }

  const { message, conversationId } = body
  if (!message || message.trim() === '') return c.json({ error: 'Message cannot be empty' }, 400)

  let user = c.get('user')
  let targetConversationId = conversationId

  // If no authenticated user, create or get an anonymous user
  if (!user) {
    const [existingAnonUser] = await db.select()
      .from(users)
      .where(eq(users.isAnon, true))
      .limit(1)
    
    if (existingAnonUser) {
      user = existingAnonUser
    } else {
      const [newAnonUser] = await db.insert(users).values({
        isAnon: true,
        email: null,
        passwordHash: null
      }).returning()
      user = newAnonUser
    }
  }

  // If no conversationId provided, create a new conversation
  if (!targetConversationId) {
    const [newConversation] = await db.insert(conversations).values({
      userId: user.id,
      title: message.trim().slice(0, 50) + (message.length > 50 ? '...' : '')
    }).returning()
    targetConversationId = newConversation.id
  } else {
    // Verify conversation belongs to user
    const [conversation] = await db.select()
      .from(conversations)
      .where(eq(conversations.id, targetConversationId))
    
    if (!conversation || conversation.userId !== user.id) {
      return c.json({ error: 'Conversation not found' }, 404)
    }
  }

  // Store user message
  const userMessageData = {
    conversationId: targetConversationId,
    prompt: message.trim(),
    response: '',
    content: 'user'
  }
  await db.insert(messages).values(userMessageData)

  const origin = c.req.header('origin') || ''
  const referer = process.env.HTTP_REFERER || origin || 'https://uxnai.vercel.app'
  
  // Create a custom stream that captures the response and stores it
  const { stream, responsePromise } = createSynthesisStreamWithStorage(
    message.trim(), 
    process.env.OPENROUTER_API_KEY, 
    referer,
    targetConversationId
  )

  // Store the AI response asynchronously when it completes
  responsePromise.then(async (aiResponse) => {
    try {
      if (aiResponse && aiResponse.trim()) {
        await db.insert(messages).values({
          conversationId: targetConversationId,
          prompt: message.trim(),
          response: aiResponse.trim(),
          content: 'assistant'
        })
        console.log('[chat] AI response stored successfully')
      }
    } catch (error) {
      console.error('[chat] Error storing AI response:', error)
    }
  }).catch(console.error)

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
  message: 'OneAI Backend - 3-Model Pipeline',
  endpoints: {
    health: 'GET /health',
    chat: 'POST /api/chat (auth required)',
    models: 'GET /api/models',
    conversations: {
      create: 'POST /api/conversations (auth required)',
      list: 'GET /api/conversations (auth required)',
      messages: 'GET /api/conversations/:id/messages (auth required)',
    },
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