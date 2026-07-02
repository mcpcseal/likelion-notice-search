import { useState } from 'react'
import { searchNotices, type Notice } from './lib/notices.ts'

function NoticeSearch() {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [answer, setAnswer] = useState('')
  const [results, setResults] = useState<Notice[]>([])
  const [error, setError] = useState('')

  const handleSearch = async () => {
    const trimmed = query.trim()
    if (!trimmed || loading) return

    setLoading(true)
    setError('')
    setAnswer('')
    setResults([])

    try {
      const { answer, notices } = await searchNotices(trimmed)
      setAnswer(answer)
      setResults(notices)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSearch()
  }

  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-bold text-neutral-900">공지사항 검색</h2>

      <div className="flex gap-2.5">
        <input
          className="flex-1 rounded-lg border border-neutral-200 bg-neutral-50 px-3.5 py-2.5 text-sm text-neutral-900 outline-none transition focus:border-brand focus:bg-white focus:ring-3 focus:ring-brand-soft disabled:opacity-60"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
          placeholder="예: 인턴 채용 공고"
        />
        <button
          className="shrink-0 rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-hover active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-500"
          onClick={handleSearch}
          disabled={loading}
        >
          {loading ? '검색 중...' : '검색'}
        </button>
      </div>

      {error && <p className="text-sm text-brand-hover">에러: {error}</p>}

      {answer && (
        <p className="rounded-lg border-l-4 border-brand bg-brand-soft px-4 py-3.5 text-sm leading-relaxed text-neutral-900">
          {answer}
        </p>
      )}

      {results.length > 0 && (
        <ul className="flex flex-col gap-3">
          {results.map((notice) => (
            <li
              key={notice.id}
              className="rounded-lg border border-neutral-200 px-4 py-3.5 transition hover:border-brand hover:shadow-[0_4px_14px_rgba(216,25,33,0.1)]"
            >
              <div className="flex items-baseline justify-between gap-3">
                <a
                  href={notice.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-semibold text-neutral-900 no-underline hover:text-brand hover:underline"
                >
                  {notice.title}
                </a>
                {notice.published_at && (
                  <span className="shrink-0 text-xs text-neutral-500">{notice.published_at}</span>
                )}
              </div>
              {notice.summary && <p className="mt-1.5 text-sm leading-relaxed text-neutral-500">{notice.summary}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default NoticeSearch
