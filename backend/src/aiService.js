const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'

const INSIGHT_MODELS = {
  model1: {
    id: 'google/gemma-4-26b-a4b-it:free',
    name: 'Gemma 4 26B'
  },
  model2: {
    id: 'nvidia/nemotron-3-nano-30b-a3b:free',
    name: 'Nemotron 3 Nano'
  }
}

const MAIN_MODEL = {
  id: 'nvidia/nemotron-3-super-120b-a12b:free',
  name: 'Nemotron 3 Super 120B'
}

const INSIGHT_SYSTEM_PROMPT =
  'You are a specialist research assistant. Provide concise, factual insights and relevant context on the topic. ' +
  'Be brief and structured — bullet points are fine. Do NOT write a final answer for the user; ' +
  'another AI will synthesise everything. Focus only on surfacing useful knowledge, nuances, and considerations.'

const MAIN_SYSTEM_PROMPT =
  'You are a helpful AI assistant. You will receive a user question along with insight notes from two specialist AI models. ' +
  'Use those insights to inform your response, but write a single coherent answer directly to the user — ' +
  'do not mention the other models or the insight process. ' +
  'Use $ for inline math and $$ for block/display math when applicable.'

/**
 * Query one insight model (non-streaming)
 */
async function queryInsightModel(userMessage, modelId, modelName, apiKey, referer) {
  const res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': referer,
      'X-Title': 'OneAI-Insight'
    },
    body: JSON.stringify({
      model: modelId,
      messages: [
        { role: 'system', content: INSIGHT_SYSTEM_PROMPT },
        { role: 'user', content: userMessage }
      ],
      stream: false,
      temperature: 0.5,
      max_tokens: 600
    })
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`${modelName} error ${res.status}: ${err}`)
  }

  const data = await res.json()
  return data.choices[0].message.content
}

/**
 * Run both insight models concurrently.
 * Uses Promise.allSettled so one failure does not block the other.
 */
export async function gatherInsights(userMessage, apiKey, referer) {
  const [r1, r2] = await Promise.allSettled([
    queryInsightModel(userMessage, INSIGHT_MODELS.model1.id, INSIGHT_MODELS.model1.name, apiKey, referer),
    queryInsightModel(userMessage, INSIGHT_MODELS.model2.id, INSIGHT_MODELS.model2.name, apiKey, referer)
  ])

  return {
    insight1: r1.status === 'fulfilled'
      ? r1.value
      : `[${INSIGHT_MODELS.model1.name} unavailable: ${r1.reason?.message}]`,
    insight2: r2.status === 'fulfilled'
      ? r2.value
      : `[${INSIGHT_MODELS.model2.name} unavailable: ${r2.reason?.message}]`
  }
}

/**
 * Build the message array for the synthesiser (main model).
 * The two insights are injected as context before the user question.
 */
function buildSynthesiserMessages(userMessage, insight1, insight2) {
  const context = `
--- Insight from Specialist Model A ---
${insight1}

--- Insight from Specialist Model B ---
${insight2}
--- End of Insights ---

User question: ${userMessage}
`.trim()

  return [
    { role: 'system', content: MAIN_SYSTEM_PROMPT },
    { role: 'user', content: context }
  ]
}

/**
 * Returns a ReadableStream that:
 *   1. Gathers insights from both models concurrently (awaits before streaming)
 *   2. Streams the main model response as SSE chunks
 *
 * The Hono route can pipe this stream directly into the Response.
 */
export function createSynthesisStream(userMessage, apiKey, referer) {
  return new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder()

      const send = (data) => controller.enqueue(enc.encode(`data: ${data}\n\n`))

      try {
        // ── Step 1: gather insights in parallel ────────────────────────────
        console.log('[aiService] Gathering insights from both models...')
        const { insight1, insight2 } = await gatherInsights(userMessage, apiKey, referer)
        console.log(`[aiService] Insights ready — A: ${insight1.length} chars, B: ${insight2.length} chars`)

        // ── Step 2: call main model with streaming ─────────────────────────
        console.log('[aiService] Streaming main model response...')
        const messages = buildSynthesiserMessages(userMessage, insight1, insight2)

        const mainRes = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'HTTP-Referer': referer,
            'X-Title': 'OneAI-Main'
          },
          body: JSON.stringify({
            model: MAIN_MODEL.id,
            messages,
            stream: true,
            temperature: 0.7,
            max_tokens: 2000
          })
        })

        if (!mainRes.ok) {
          const err = await mainRes.text()
          throw new Error(`Main model error ${mainRes.status}: ${err}`)
        }

        // Pipe OpenRouter SSE → our stream
        const reader = mainRes.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() // hold incomplete line

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const chunk = line.slice(6).trim()
            if (chunk === '[DONE]') {
              send('[DONE]')
              controller.close()
              return
            }
            send(chunk) // forward raw JSON chunk
          }
        }

        // Flush any leftover
        if (buffer.startsWith('data: ')) {
          send(buffer.slice(6).trim())
        }

        send('[DONE]')
        controller.close()
      } catch (err) {
        console.error('[aiService] Error:', err.message)
        send(JSON.stringify({ error: err.message }))
        controller.close()
      }
    }
  })
}
export function isConfigured() {
  return !!process.env.OPENROUTER_API_KEY
}
export { INSIGHT_MODELS, MAIN_MODEL }