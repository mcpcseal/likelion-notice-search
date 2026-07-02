import * as cheerio from 'cheerio'
import type { BoardConfig, NoticeListItem } from './types.ts'

const NOTICE_LINK_PATTERN = /fn_egov_inqire_notice\('([^']*)',\s*'([^']*)'\)/

export async function fetchBoardList(board: BoardConfig, pageIndex = 1): Promise<NoticeListItem[]> {
  const url = `${board.baseUrl}${board.listPath}?bbsId=${board.bbsId}&pageIndex=${pageIndex}`
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })

  if (!res.ok) {
    throw new Error(`목록 페이지 요청 실패 (${board.id}): HTTP ${res.status}`)
  }

  const html = await res.text()
  const $ = cheerio.load(html)
  const items: NoticeListItem[] = []

  // 게시판마다 목록 템플릿이 다르다: 일반 텍스트 목록은 ul.normal_board,
  // 공연/전시처럼 썸네일이 있는 갤러리형 목록은 ul.board_list를 쓴다.
  $('ul.normal_board > li, ul.board_list > li').each((_, el) => {
    const link = $(el).find('a[href*="fn_egov_inqire_notice"]').first()
    const match = (link.attr('href') ?? '').match(NOTICE_LINK_PATTERN)
    if (!match) return

    const nttId = match[2]
    const subj = link.find('span.subj').first()

    let title: string
    if (subj.length > 0) {
      title = subj.text().replace(/\s+/g, ' ').trim()
    } else {
      const linkClone = link.clone()
      linkClone.find('strong.speaker').remove()
      title = linkClone.text().replace(/\s+/g, ' ').trim()
    }

    items.push({ nttId, title })
  })

  return items
}
