import { Type } from '@google/genai'
import { gemini, GEMINI_MODEL } from './geminiClient.ts'
import { supabase } from './supabaseClient.ts'

export type Notice = {
  id: string
  board_id: string
  board_name: string
  ntt_id: string
  url: string
  title: string
  summary: string | null
  keywords: string[]
  author: string | null
  published_at: string | null
}

async function extractKeywords(query: string): Promise<string[]> {
  const response = await gemini.models.generateContent({
    model: GEMINI_MODEL,
    contents: `사용자가 학교 공지사항 게시판에서 검색하고 싶어하는 질문이다. 검색에 사용할 핵심 키워드를 1~5개 한국어로 뽑아라.\n\n질문: ${query}`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['keywords'],
      },
    },
  })

  if (!response.text) return [query]

  try {
    const parsed = JSON.parse(response.text)
    const keywords = Array.isArray(parsed.keywords) ? parsed.keywords.map(String) : []
    return keywords.length > 0 ? keywords : [query]
  } catch {
    return [query]
  }
}

// PostgREST .or() 필터 문자열에 섞이면 파싱이 깨지는 구분자(,()%)를 제거한다.
function sanitizeForFilter(keyword: string): string {
  return keyword.replace(/[,()%]/g, ' ').trim()
}

async function findNotices(keywords: string[]): Promise<Notice[]> {
  const terms = keywords.map(sanitizeForFilter).filter(Boolean)
  if (terms.length === 0) return []

  const orFilter = terms.flatMap((term) => [`title.ilike.%${term}%`, `summary.ilike.%${term}%`]).join(',')

  const { data, error } = await supabase
    .from('notices')
    .select('id, board_id, board_name, ntt_id, url, title, summary, keywords, author, published_at')
    .or(orFilter)
    .order('published_at', { ascending: false })
    .limit(10)

  if (error) throw new Error(error.message)
  return data ?? []
}

async function synthesizeAnswer(query: string, notices: Notice[]): Promise<string> {
  if (notices.length === 0) return '관련된 공지사항을 찾지 못했습니다.'

  const context = notices
    .map((n, i) => `${i + 1}. [${n.published_at ?? '날짜 미상'}] ${n.title}\n요약: ${n.summary ?? '(요약 없음)'}`)
    .join('\n\n')

  const response = await gemini.models.generateContent({
    model: GEMINI_MODEL,
    contents: `다음은 검색된 학교 공지사항 목록이다. 사용자 질문에 이 목록을 근거로 한국어로 간결하게 답하라. 목록에 없는 내용은 지어내지 마라. 마크다운 문법(**, *, #, - 등)은 절대 쓰지 말고 순수 텍스트로만 답하라.\n\n질문: ${query}\n\n공지사항 목록:\n${context}`,
  })

  return response.text ?? '답변을 생성하지 못했습니다.'
}

export async function searchNotices(query: string): Promise<{ answer: string; notices: Notice[] }> {
  const keywords = await extractKeywords(query)
  const notices = await findNotices(keywords)
  const answer = await synthesizeAnswer(query, notices)
  return { answer, notices }
}
