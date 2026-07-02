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

type QueryAnalysis = {
  keywords: string[]
  recency: boolean
}

async function analyzeQuery(history: ChatTurn[], query: string): Promise<QueryAnalysis> {
  const conversation = formatHistory(history)
  const response = await gemini.models.generateContent({
    model: GEMINI_MODEL,
    contents: `공지사항 검색 챗봇이다. 마지막 질문에서 keywords(검색용 핵심 키워드 0~5개, "최근/최신/요즘/오늘" 같은 시간 표현과 "공지/공지사항/안내/소식" 같은 범용어는 제외)와 recency(특정 주제 없이 최신 목록만 원하면 true)를 추출하라. 질문이 이전 대화를 가리키면 그 주제를 반영하라.\n\n${conversation ? `이전 대화:\n${conversation}\n\n` : ''}마지막 질문: ${query}`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
          recency: { type: Type.BOOLEAN },
        },
        required: ['keywords', 'recency'],
      },
    },
  })

  if (!response.text) return { keywords: [query], recency: false }

  try {
    const parsed = JSON.parse(response.text)
    const keywords = Array.isArray(parsed.keywords) ? parsed.keywords.map(String) : []
    const recency = parsed.recency === true
    return { keywords: keywords.length > 0 || recency ? keywords : [query], recency }
  } catch {
    return { keywords: [query], recency: false }
  }
}

// PostgREST .or() 필터 문자열에 섞이면 파싱이 깨지는 구분자(,()%)를 제거한다.
function sanitizeForFilter(keyword: string): string {
  return keyword.replace(/[,()%]/g, ' ').trim()
}

const CANDIDATE_LIMIT = 100
const RESULT_LIMIT = 10

// 매칭된 키워드의 글자 수 합으로 관련성을 계산한다. "공지"처럼 짧고 흔한
// 키워드가 "학생회비"처럼 길고 구체적인 키워드의 신호를 덮어버리는 것을 방지하기 위함.
function relevanceScore(notice: Notice, terms: string[]): number {
  const haystack = `${notice.title} ${notice.summary ?? ''}`.toLowerCase()
  return terms.reduce((score, term) => (haystack.includes(term.toLowerCase()) ? score + term.length : score), 0)
}

const NOTICE_COLUMNS = 'id, board_id, board_name, ntt_id, url, title, summary, keywords, author, published_at'

async function findNotices(keywords: string[], recency: boolean): Promise<Notice[]> {
  const terms = keywords.map(sanitizeForFilter).filter(Boolean)

  // 주제 키워드 없이 "최근 공지 있어?"류로만 물으면 주제 필터 없이 최신순으로 바로 반환한다.
  if (terms.length === 0) {
    if (!recency) return []

    const { data, error } = await supabase
      .from('notices')
      .select(NOTICE_COLUMNS)
      .order('published_at', { ascending: false })
      .limit(RESULT_LIMIT)

    if (error) throw new Error(error.message)
    return data ?? []
  }

  const orFilter = terms.flatMap((term) => [`title.ilike.%${term}%`, `summary.ilike.%${term}%`]).join(',')

  const { data, error } = await supabase
    .from('notices')
    .select(NOTICE_COLUMNS)
    .or(orFilter)
    .order('published_at', { ascending: false })
    .limit(CANDIDATE_LIMIT)

  if (error) throw new Error(error.message)

  // 최신순 요청이면 관련성 점수 대신 게시일 순서를 그대로 우선한다 (DB에서 이미 최신순 정렬됨).
  if (recency) {
    return (data ?? []).slice(0, RESULT_LIMIT)
  }

  return (data ?? [])
    .map((notice) => ({ notice, score: relevanceScore(notice, terms) }))
    .sort((a, b) => b.score - a.score || (b.notice.published_at ?? '').localeCompare(a.notice.published_at ?? ''))
    .slice(0, RESULT_LIMIT)
    .map(({ notice }) => notice)
}

// 프롬프트에 지시하는 목표 답변 길이 (모델이 이 안에서 답하도록 유도)
const ANSWER_TARGET_LENGTH = 50

async function synthesizeAnswer(
  history: ChatTurn[],
  query: string,
  notices: Notice[],
): Promise<{ answer: string; found: boolean }> {
  if (notices.length === 0) {
    return { answer: '관련된 공지사항을 찾지 못했습니다. 다른 키워드로 다시 물어봐 주세요.', found: false }
  }

  const context = notices
    .map((n, i) => `${i + 1}. [${n.published_at ?? '날짜 미상'}] ${n.title}\n요약: ${n.summary ?? '(요약 없음)'}`)
    .join('\n\n')

  const conversation = formatHistory(history)
  const response = await gemini.models.generateContent({
    model: GEMINI_MODEL,
    contents: `공지사항 검색 챗봇이다. 아래 목록만 근거로 마지막 질문에 한국어로, 마크다운 없이 순수 텍스트로, 공백 포함 ${ANSWER_TARGET_LENGTH}자 미만으로 답하라. 목록에 없는 내용은 지어내지 마라. 관련 공지가 2건 이상이면 나열하지 말고 대표 제목 1개 + "등 N건이 있습니다" 형식으로 답하라. 실제로 관련된 공지가 없으면 found를 false로 하고 찾지 못했다는 취지로 답하라.\n\n${conversation ? `이전 대화:\n${conversation}\n\n` : ''}마지막 질문: ${query}\n\n공지사항 목록:\n${context}`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          found: { type: Type.BOOLEAN },
          answer: { type: Type.STRING },
        },
        required: ['found', 'answer'],
      },
    },
  })

  if (!response.text) return { answer: '답변을 생성하지 못했습니다.', found: false }

  let parsed: { found?: unknown; answer?: unknown }
  try {
    parsed = JSON.parse(response.text)
  } catch {
    return { answer: '답변을 생성하지 못했습니다.', found: false }
  }

  const answer = typeof parsed.answer === 'string' ? parsed.answer : '답변을 생성하지 못했습니다.'
  const found = parsed.found === true
  return { answer, found }
}

export async function chatWithNotices(
  history: ChatTurn[],
  query: string,
): Promise<{ answer: string; notices: Notice[] }> {
  const { keywords, recency } = await analyzeQuery(history, query)
  const notices = await findNotices(keywords, recency)
  const { answer, found } = await synthesizeAnswer(history, query, notices)
  return { answer, notices: found ? notices : [] }
}

// 기존 단발 검색 API (NoticeSearch.tsx 호환용)
export async function searchNotices(query: string): Promise<{ answer: string; notices: Notice[] }> {
  return chatWithNotices([], query)
}
