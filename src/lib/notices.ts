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

export type ChatTurn = {
  role: 'user' | 'model'
  text: string
}

// 프롬프트에 포함할 최근 대화 턴 수 (토큰 절약)
const HISTORY_WINDOW = 8

function formatHistory(history: ChatTurn[]): string {
  return history
    .slice(-HISTORY_WINDOW)
    .map((turn) => `${turn.role === 'user' ? '사용자' : '챗봇'}: ${turn.text}`)
    .join('\n')
}

async function extractKeywords(history: ChatTurn[], query: string): Promise<string[]> {
  const conversation = formatHistory(history)
  const response = await gemini.models.generateContent({
    model: GEMINI_MODEL,
    contents: `학교 공지사항 게시판을 검색하는 챗봇의 대화다. 사용자의 마지막 질문을 검색할 핵심 키워드를 1~5개 한국어로 뽑아라. 마지막 질문이 이전 대화를 가리키면(예: "그거 언제까지야?") 이전 대화에서 주제를 찾아 키워드에 반영하라.\n\n${conversation ? `이전 대화:\n${conversation}\n\n` : ''}마지막 질문: ${query}`,
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

const ANSWER_MAX_LENGTH = 200

async function synthesizeAnswer(history: ChatTurn[], query: string, notices: Notice[]): Promise<string> {
  if (notices.length === 0) return '관련된 공지사항을 찾지 못했습니다. 다른 키워드로 다시 물어봐 주세요.'

  const context = notices
    .map((n, i) => `${i + 1}. [${n.published_at ?? '날짜 미상'}] ${n.title}\n요약: ${n.summary ?? '(요약 없음)'}`)
    .join('\n\n')

  const conversation = formatHistory(history)
  const response = await gemini.models.generateContent({
    model: GEMINI_MODEL,
    contents: `너는 학교 공지사항 검색 챗봇이다. 검색된 공지사항 목록을 근거로 사용자의 마지막 질문에 한국어로 답하라. 목록에 없는 내용은 지어내지 마라. 마크다운 문법(**, *, #, - 등)은 절대 쓰지 말고 순수 텍스트로만 답하라. 반드시 공백 포함 ${ANSWER_MAX_LENGTH}자 이내로 답하라.\n\n${conversation ? `이전 대화:\n${conversation}\n\n` : ''}마지막 질문: ${query}\n\n공지사항 목록:\n${context}`,
  })

  const answer = response.text ?? '답변을 생성하지 못했습니다.'
  return answer.length > ANSWER_MAX_LENGTH ? `${answer.slice(0, ANSWER_MAX_LENGTH - 1)}…` : answer
}

export async function chatWithNotices(
  history: ChatTurn[],
  query: string,
): Promise<{ answer: string; notices: Notice[] }> {
  const keywords = await extractKeywords(history, query)
  const notices = await findNotices(keywords)
  const answer = await synthesizeAnswer(history, query, notices)
  return { answer, notices }
}

// 기존 단발 검색 API (NoticeSearch.tsx 호환용)
export async function searchNotices(query: string): Promise<{ answer: string; notices: Notice[] }> {
  return chatWithNotices([], query)
}
