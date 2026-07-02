import * as cheerio from 'cheerio'
import type { BoardConfig, NoticeDetail } from './types.ts'

export function buildDetailUrl(board: BoardConfig, nttId: string): string {
  return `${board.baseUrl}${board.detailPath}?pubDetail=Y&bbsId=${board.bbsId}&nttId=${nttId}`
}

export async function fetchNoticeDetail(board: BoardConfig, nttId: string): Promise<NoticeDetail> {
  const url = buildDetailUrl(board, nttId)
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })

  if (!res.ok) {
    throw new Error(`상세 페이지 요청 실패 (${board.id}/${nttId}): HTTP ${res.status}`)
  }

  const html = await res.text()
  const $ = cheerio.load(html)

  const title = $('h4.tit').first().text().trim()
  const content = $('.view_content .se-contents').text().replace(/\s+/g, ' ').trim()

  let author: string | null = null
  let publishedAt: string | null = null

  $('.row .item').each((_, el) => {
    const label = $(el).find('.div-th').text().trim()
    const value = $(el).find('.div-td').text().trim()
    if (label === '작성자') author = value
    if (label === '작성일') publishedAt = value
  })

  return { title, content, author, publishedAt }
}
