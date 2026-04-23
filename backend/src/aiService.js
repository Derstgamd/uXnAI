// =============================================================================
// aiService.js — Mixture of Agents synthesis engine
//
// Architecture: Together AI MoA paper (arxiv 2406.04692)
//
//   Round 1:  All proposers answer independently in parallel
//   Round N:  All proposers see every other model's round-(N-1) output
//             before generating their refined response (reference injection)
//   Final:    Aggregator synthesises all final-round outputs into one answer
//
// To add a model: drop a new entry into INSIGHT_MODELS. Nothing else changes.
//
// Streaming event format (multiplexed SSE):
//   { type: 'deliberation', model, role, round, delta }  — proposer token
//   { type: 'synthesis',    delta }                      — aggregator token
//   { type: 'done' }                                     — stream complete
//   { type: 'error',        message }                    — fatal error
// =============================================================================

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'

const INSIGHT_TIMEOUT_MS = 45_000
const MAIN_TIMEOUT_MS = 90_000

export const DEFAULT_ROUNDS = 2

// =============================================================================
// Proposer models
// =============================================================================
// To add a proposer: append an object to this array. The engine scales
// automatically — no other code needs to change.
//
// Required fields: id, name, role, systemPrompt
// Optional fields: baseUrl (defaults to OPENROUTER_BASE_URL), apiKey (defaults to env)

export const INSIGHT_MODELS = [
  {
    id: 'inclusionai/ling-2.6-flash:free',
    name: 'InclusionAi Ling',
    role: 'Analyst',
    systemPrompt:
      'You are a rigorous analytical specialist. Answer the user\'s question fully and directly. ' +
      'Break the problem into its component parts, surface relevant facts, data, and logical structure. ' +
      'Be precise and structured — numbered points are ideal. ' +
      'Write a complete, standalone answer. Another AI will synthesise your response alongside others.'
  },
  {
    id: 'nvidia/nemotron-3-nano-30b-a3b:free',
    name: 'Nemotron 3 Nano',
    role: 'Contrarian',
    systemPrompt:
      'You are a critical specialist. Answer the user\'s question fully and directly, ' +
      'but lead with counterarguments, edge cases, common misconceptions, and failure modes. ' +
      'Challenge assumptions. Be concise and structured — bullet points preferred. ' +
      'Write a complete, standalone answer. Another AI will synthesise your response alongside others.'
  },
  {
    id: 'liquid/lfm-2.5-1.2b-thinking:free',
    name: 'LFM 2.5 1.2B Thinking',
    role: 'Creative',
    systemPrompt:
      'You are a creative specialist. Answer the user\'s question fully and directly, ' +
      'but lead with creative ideas, alternative perspectives, and unconventional approaches. ' +
      'Challenge assumptions. Be concise and structured — bullet points preferred. ' +
      'Write a complete, standalone answer. Another AI will synthesise your response alongside others.'
  },
  // ─── Add more proposers here ───────────────────────────────────────────────
  // Any OpenAI-compatible endpoint works. Just set baseUrl and apiKey per model.
  //
  // OpenRouter example:
  // {
  //   id: 'meta-llama/llama-3.3-70b-instruct:free',
  //   name: 'Llama 3.3 70B',
  //   role: 'Contextualiser',
  //   systemPrompt:
  //     'You are a context specialist. Answer the user\'s question fully and directly, ' +
  //     'situating it in its broader historical, cultural, or scientific context. ' +
  //     'Surface background knowledge, prior art, and real-world examples. ' +
  //     'Write a complete, standalone answer. Another AI will synthesise your response alongside others.'
  // },
  //
  // Self-hosted (Ollama, vLLM, llama.cpp — any OpenAI-compatible server):
  // {
  //   id: 'llama3:8b',
  //   name: 'Llama 3 8B (local)',
  //   role: 'Pragmatist',
  //   baseUrl: 'http://localhost:11434/v1',
  //   apiKey: 'ollama',
  //   systemPrompt:
  //     'You are a pragmatic specialist. Answer the user\'s question directly, ' +
  //     'focusing on practical, actionable, real-world considerations. ' +
  //     'Write a complete, standalone answer. Another AI will synthesise your response alongside others.'
  // }
]

// =============================================================================
// Aggregator model
// =============================================================================

export const MAIN_MODEL = {
  id: 'openai/gpt-oss-120b:free',
  name: 'GPT OSS 120B'
}

const MAIN_SYSTEM_PROMPT =
  'You are a helpful AI assistant. You will receive a user question along with ' +
  'complete answers from multiple specialist AI models, each with a distinct analytical perspective. ' +
  'Synthesise the best of what each model offered into a single coherent, well-reasoned answer. ' +
  'Do not mention the other models, the deliberation process, or that you are synthesising. ' +
  'Write directly to the user as if this is your own answer. ' +
  'Use $ for inline math and $$ for block/display math when applicable.'

// =============================================================================
// Helpers
// =============================================================================

function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController()
  const timerId = setTimeout(() => controller.abort(), timeoutMs)
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timerId))
}

function extractDeltaContent(chunk) {
  try {
    const parsed = JSON.parse(chunk)
    return parsed?.choices?.[0]?.delta?.content ?? ''
  } catch {
    return ''
  }
}

function modelBaseUrl(model) {
  return model.baseUrl ?? OPENROUTER_BASE_URL
}

function modelApiKey(model, fallbackApiKey) {
  return model.apiKey ?? fallbackApiKey
}

// =============================================================================
// streamInsightModel — stream one proposer's response
// =============================================================================
// Streams the proposer token by token, calling onDelta for each token so
// the caller can forward deliberation to the UI in real time.
// Resolves with the full accumulated response text when done.
//
// references: string[]  — other models' prior-round outputs (MoA reference injection)
// conversationHistory: Message[] — { role, content }[] for multi-turn memory

async function streamInsightModel(
  userMessage,
  model,
  apiKey,
  referer,
  references = [],
  conversationHistory = [],
  onDelta = () => { }
) {
  // ── Reference injection (core MoA mechanism) ───────────────────────────────
  // In round 2+, each proposer receives every other model's round-(N-1) output.
  // The proposer can agree, disagree, or add what they missed — this cross-
  // pollination is what drives the quality gains shown in the paper.
  let userContent = userMessage
  if (references.length > 0) {
    const refBlock = references
      .map((ref, i) => `--- Reference answer ${i + 1} ---\n${ref}`)
      .join('\n\n')

    userContent =
      `${refBlock}\n\n` +
      `--- End of reference answers ---\n\n` +
      `The above are answers from your peer specialist models. ` +
      `You may build on, challenge, or refine what they said. ` +
      `Now provide your own complete answer to the user\'s question.\n\n` +
      `User question: ${userMessage}`
  }

  const messages = [
    ...conversationHistory.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: userContent }
  ]

  const res = await fetchWithTimeout(
    `${modelBaseUrl(model)}/chat/completions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${modelApiKey(model, apiKey)}`,
        'HTTP-Referer': referer,
        'X-Title': `OneAI-${model.role}`
      },
      body: JSON.stringify({
        model: model.id,
        messages: [
          { role: 'system', content: model.systemPrompt },
          ...messages
        ],
        stream: true,
        temperature: 0.5,
        max_tokens: 1200
      })
    },
    INSIGHT_TIMEOUT_MS
  )

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`${model.name} [${model.role}] error ${res.status}: ${err}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let fullOutput = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop()

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const chunk = line.slice(6).trim()
      if (chunk === '[DONE]') break

      const delta = extractDeltaContent(chunk)
      if (delta) {
        fullOutput += delta
        onDelta(delta)
      }
    }
  }

  return fullOutput
}

// =============================================================================
// gatherInsights — multi-model, multi-round deliberation
// =============================================================================
// Round 1: all proposers run in parallel with no references (MoA-correct)
// Round N: all proposers run in parallel, each receiving every OTHER model's
//          round-(N-1) output as reference context
//
// onDelta(model, role, round, delta) is called per streaming token so the
// caller can forward live deliberation to the UI.

export async function gatherInsights(userMessage, apiKey, referer, options = {}) {
  const {
    rounds = DEFAULT_ROUNDS,
    conversationHistory = [],
    models = INSIGHT_MODELS,
    onDelta = () => { }
  } = options

  // outputs[i] = latest full text from models[i]
  let outputs = new Array(models.length).fill('')

  for (let round = 0; round < rounds; round++) {
    console.log(`[aiService] Round ${round + 1}/${rounds} — ${models.length} proposers in parallel`)

    // Each model's references = every OTHER model's previous-round output
    // Round 1 gets no references (correct per MoA paper)
    const referenceSlices = models.map((_, i) =>
      round === 0
        ? []
        : outputs.filter((out, j) => j !== i && out !== '')
    )

    const results = await Promise.allSettled(
      models.map((model, i) =>
        streamInsightModel(
          userMessage,
          model,
          apiKey,
          referer,
          referenceSlices[i],
          conversationHistory,
          (delta) => onDelta(model.name, model.role, round + 1, delta)
        )
      )
    )

    results.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        outputs[i] = result.value
      } else {
        const reason = result.reason?.name === 'AbortError'
          ? `timed out after ${INSIGHT_TIMEOUT_MS / 1000}s`
          : result.reason?.message ?? 'unknown error'
        console.warn(`[aiService] ${models[i].name} failed in round ${round + 1}: ${reason}`)
        // On first-round failure, record unavailability notice
        // On later-round failure, retain the previous round's output
        if (round === 0) {
          outputs[i] = `[${models[i].name} (${models[i].role}) unavailable: ${reason}]`
        }
      }
    })

    const ok = results.filter(r => r.status === 'fulfilled').length
    console.log(`[aiService] Round ${round + 1} complete — ${ok}/${models.length} succeeded`)
  }

  return models.map((model, i) => ({
    model: model.name,
    role: model.role,
    output: outputs[i]
  }))
}

// =============================================================================
// buildSynthesiserMessages
// =============================================================================

function buildSynthesiserMessages(userMessage, insights, conversationHistory = []) {
  const insightBlock = insights
    .map(({ model, role, output }) => `--- ${model} · ${role} ---\n${output}`)
    .join('\n\n')

  const contextMessage = [
    insightBlock,
    '--- End of specialist answers ---',
    '',
    `User question: ${userMessage}`
  ].join('\n').trim()

  return [
    { role: 'system', content: MAIN_SYSTEM_PROMPT },
    ...conversationHistory.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: contextMessage }
  ]
}

// =============================================================================
// createSynthesisStream
// =============================================================================
// Main export. Returns a ReadableStream of multiplexed SSE events.
//
// Event shapes:
//   { type: 'deliberation', model, role, round, delta }
//   { type: 'synthesis', delta }
//   { type: 'done' }
//   { type: 'error', message }
//
// Options:
//   rounds              — refinement rounds (default: DEFAULT_ROUNDS)
//   conversationHistory — Message[] for multi-turn memory
//   models              — override proposer array (defaults to INSIGHT_MODELS)
//   onComplete(full)    — called with full synthesised text on completion
//   onError(err)        — called on fatal error

export function createSynthesisStream(userMessage, apiKey, referer, options = {}) {
  const {
    rounds = DEFAULT_ROUNDS,
    conversationHistory = [],
    models = INSIGHT_MODELS,
    onComplete,
    onError
  } = options

  return new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder()
      const send = (obj) =>
        controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`))

      try {
        // ── Step 1: Multi-round proposer deliberation (streaming) ──────────────
        console.log(`[aiService] Starting ${rounds}-round MoA pipeline with ${models.length} proposers`)

        const insights = await gatherInsights(userMessage, apiKey, referer, {
          rounds,
          conversationHistory,
          models,
          onDelta: (model, role, round, delta) =>
            send({ type: 'deliberation', model, role, round, delta })
        })

        const validCount = insights.filter(i => !i.output.startsWith('[')).length
        console.log(`[aiService] Deliberation complete — ${validCount}/${models.length} proposers contributed`)

        // ── Step 2: Aggregator synthesis (streaming) ───────────────────────────
        console.log('[aiService] Streaming aggregator synthesis...')
        const messages = buildSynthesiserMessages(userMessage, insights, conversationHistory)

        const mainRes = await fetchWithTimeout(
          `${OPENROUTER_BASE_URL}/chat/completions`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`,
              'HTTP-Referer': referer,
              'X-Title': 'OneAI-Aggregator'
            },
            body: JSON.stringify({
              model: MAIN_MODEL.id,
              messages,
              stream: true,
              temperature: 0.7,
              max_tokens: 2000
            })
          },
          MAIN_TIMEOUT_MS
        )

        if (!mainRes.ok) {
          const err = await mainRes.text()
          throw new Error(`Aggregator error ${mainRes.status}: ${err}`)
        }

        const reader = mainRes.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let fullResponse = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop()

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const chunk = line.slice(6).trim()

            if (chunk === '[DONE]') {
              send({ type: 'done' })
              onComplete?.(fullResponse)
              controller.close()
              return
            }

            const delta = extractDeltaContent(chunk)
            if (delta) {
              fullResponse += delta
              send({ type: 'synthesis', delta })
            }
          }
        }

        // Flush any leftover buffer
        if (buffer.startsWith('data: ')) {
          const delta = extractDeltaContent(buffer.slice(6).trim())
          if (delta) {
            fullResponse += delta
            send({ type: 'synthesis', delta })
          }
        }

        send({ type: 'done' })
        onComplete?.(fullResponse)
        controller.close()
      } catch (err) {
        console.error('[aiService] Fatal error:', err.message)
        send({ type: 'error', message: err.message })
        onError?.(err)
        controller.close()
      }
    }
  })
}

// =============================================================================
// createSynthesisStreamWithStorage
// =============================================================================
// Wraps createSynthesisStream and exposes a responsePromise that resolves
// with the complete synthesised text — use this to persist the final answer
// to the DB once streaming completes.

export function createSynthesisStreamWithStorage(userMessage, apiKey, referer, options = {}) {
  let resolvePromise, rejectPromise

  const responsePromise = new Promise((resolve, reject) => {
    resolvePromise = resolve
    rejectPromise = reject
  })

  const stream = createSynthesisStream(userMessage, apiKey, referer, {
    ...options,
    onComplete: resolvePromise,
    onError: rejectPromise
  })

  return { stream, responsePromise }
}

// =============================================================================
// Utilities
// =============================================================================

export function isConfigured() {
  return !!process.env.OPENROUTER_API_KEY
}