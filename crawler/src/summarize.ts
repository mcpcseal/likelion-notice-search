import { GoogleGenAI, Type } from '@google/genai'
import type { Summary } from './types.ts'

const MODEL = 'gemini-3.5-flash'

const client = new GoogleGenAI({})

export async function summarizeNotice(title: string, content: string): Promise<Summary> {
  const fallback: Summary = { summary: content.slice(0, 200), keywords: [] }

  try {
    const response = await client.models.generateContent({
      model: MODEL,
      contents: `다음은 학교 공지사항이다. 3문장 이내로 요약하고 핵심 키워드를 3~5개 뽑아라.\n\n제목: ${title}\n본문: ${content.slice(0, 4000)}`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ['summary', 'keywords'],
        },
      },
    })

    if (!response.text) {
      console.error(`요약 응답 없음 (${title}) — 본문 앞부분으로 대체`)
      return fallback
    }

    const parsed = JSON.parse(response.text)
    return {
      summary: typeof parsed.summary === 'string' ? parsed.summary : fallback.summary,
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords.map(String) : [],
    }
  } catch (err) {
    console.error(`요약 API 요청 실패 (${title}): ${err instanceof Error ? err.message : err} — 본문 앞부분으로 대체`)
    return fallback
  }
}
