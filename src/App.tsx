import { useState } from 'react'

type Message = {
  role: 'user' | 'assistant'
  content: string
}

const OPENROUTER_API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY
const MODEL = 'google/gemma-4-31b-it:free'
const MAX_RETRIES = 3

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function fetchChatCompletion(messages: Message[]): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
      }),
    })

    if (res.status !== 429 || attempt >= MAX_RETRIES) {
      return res
    }

    // 업스트림(:free 모델) 혼잡으로 인한 429는 재시도하면 해소되는 경우가 많음
    const retryAfter = Number(res.headers.get('retry-after'))
    const delayMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 1000
    await sleep(delayMs)
  }
}

function App() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  const sendMessage = async () => {
    const trimmed = input.trim()
    if (!trimmed || loading) return

    const nextMessages: Message[] = [...messages, { role: 'user', content: trimmed }]
    setMessages(nextMessages)
    setInput('')
    setLoading(true)

    try {
      const res = await fetchChatCompletion(nextMessages)

      if (!res.ok) {
        throw new Error(`OpenRouter API error: ${res.status}`)
      }

      const data = await res.json()
      const reply: string = data.choices?.[0]?.message?.content ?? ''
      setMessages([...nextMessages, { role: 'assistant', content: reply }])
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setMessages([...nextMessages, { role: 'assistant', content: `Error: ${message}` }])
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') sendMessage()
  }

  return (
    <div>
      <h1>Gemma Chatbot</h1>
      <div>
        {messages.map((m, i) => (
          <p key={i}>
            <strong>{m.role}:</strong> {m.content}
          </p>
        ))}
      </div>
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={loading}
        placeholder="메시지를 입력하세요"
      />
      <button onClick={sendMessage} disabled={loading}>
        {loading ? '전송 중...' : '전송'}
      </button>
    </div>
  )
}

export default App
