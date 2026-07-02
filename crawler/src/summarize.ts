import type { Summary } from './types.ts'

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY
const MODEL = 'google/gemma-4-31b-it:free'
const MAX_RETRIES = 3

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function requestSummary(title: string, content: string): Promise<Response> {
  const prompt = `다음은 학교 공지사항이다. 3문장 이내로 요약하고 핵심 키워드를 3~5개 뽑아라.
반드시 아래 JSON 형식으로만 답하라. 다른 설명은 절대 추가하지 마라.
{"summary": "...", "keywords": ["...", "..."]}

제목: ${title}
본문: ${content.slice(0, 4000)}`

  for (let attempt = 0; ; attempt++) {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (res.status !== 429 || attempt >= MAX_RETRIES) {
      return res
    }

    const retryAfter = Number(res.headers.get('retry-after'))
    const delayMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 1000
    await sleep(delayMs)
  }
}

export async function summarizeNotice(title: string, content: string): Promise<Summary> {
  const fallback: Summary = { summary: content.slice(0, 200), keywords: [] }

  const res = await requestSummary(title, content)
  if (!res.ok) {
    console.error(`요약 API 요청 실패: HTTP ${res.status} — 본문 앞부분으로 대체`)
    return fallback
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  const raw: string = data.choices?.[0]?.message?.content ?? ''
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return fallback

  try {
    const parsed = JSON.parse(jsonMatch[0])
    return {
      summary: typeof parsed.summary === 'string' ? parsed.summary : fallback.summary,
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords.map(String) : [],
    }
  } catch {
    return fallback
  }
}
