import { useEffect, useRef, useState } from 'react'
import { chatWithNotices, type ChatTurn, type Notice } from './lib/notices.ts'

type Message = {
  role: 'user' | 'model'
  text: string
  notices?: Notice[]
}

function Chatbot() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const handleSend = async () => {
    const trimmed = input.trim()
    if (!trimmed || loading) return

    // 검색 호출에 넘길 히스토리는 이번 질문을 추가하기 전 시점으로 스냅샷
    const history: ChatTurn[] = messages.map(({ role, text }) => ({ role, text }))

    setMessages((prev) => [...prev, { role: 'user', text: trimmed }])
    setInput('')
    setLoading(true)

    try {
      const { answer, notices } = await chatWithNotices(history, trimmed)
      setMessages((prev) => [...prev, { role: 'model', text: answer, notices }])
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setMessages((prev) => [...prev, { role: 'model', text: `에러: ${message}` }])
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // 한글 IME 조합 중 Enter는 무시 (중복 전송 방지)
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleSend()
  }

  return (
    <section className="flex h-[34rem] flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-6">
        {messages.length === 0 && (
          <p className="rounded-lg bg-neutral-50 px-4 py-3.5 text-sm leading-relaxed text-neutral-500">
            궁금한 공지사항을 물어보세요. 예: "인턴 채용 공고 있어?" 이후 "그거 마감 언제야?"처럼 이어서 질문할 수
            있어요.
          </p>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'rounded-br-sm bg-brand text-white'
                  : 'rounded-bl-sm bg-neutral-100 text-neutral-900'
              }`}
            >
              {msg.text}
            </div>

            {msg.notices && msg.notices.length > 0 && (
              <ul className="mt-2 flex w-full max-w-[85%] flex-col gap-2">
                {msg.notices.map((notice) => (
                  <li
                    key={notice.id}
                    className="rounded-lg border border-neutral-200 px-3.5 py-2.5 transition hover:border-brand hover:shadow-[0_4px_14px_rgba(216,25,33,0.1)]"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <a
                        href={notice.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-semibold text-neutral-900 no-underline hover:text-brand hover:underline"
                      >
                        {notice.title}
                      </a>
                      {notice.published_at && (
                        <span className="shrink-0 text-[11px] text-neutral-500">{notice.published_at}</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex items-start">
            <div className="rounded-2xl rounded-bl-sm bg-neutral-100 px-4 py-2.5 text-sm text-neutral-500">
              공지사항 찾는 중...
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="flex gap-2.5 border-t border-neutral-200 p-4">
        <input
          className="flex-1 rounded-lg border border-neutral-200 bg-neutral-50 px-3.5 py-2.5 text-sm text-neutral-900 outline-none transition focus:border-brand focus:bg-white focus:ring-3 focus:ring-brand-soft disabled:opacity-60"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
          placeholder="예: 인턴 채용 공고 있어?"
        />
        <button
          className="shrink-0 rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-hover active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-500"
          onClick={handleSend}
          disabled={loading}
        >
          전송
        </button>
      </div>
    </section>
  )
}

export default Chatbot
