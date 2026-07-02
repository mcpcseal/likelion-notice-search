import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import type { BoardConfig } from './types.ts'
import { fetchBoardList } from './fetchList.ts'
import { fetchNoticeDetail, buildDetailUrl } from './fetchDetail.ts'
import { summarizeNotice } from './summarize.ts'
import { supabase } from './supabaseClient.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const boardsPath = path.join(__dirname, '..', 'config', 'boards.json')
const boards: BoardConfig[] = JSON.parse(readFileSync(boardsPath, 'utf-8'))

// 한 번 실행에서 게시판당 최대로 순회할 페이지 수 (전체 히스토리 재크롤링 방지용 안전장치)
const MAX_PAGES = 20

async function alreadyStored(boardId: string, nttId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('notices')
    .select('id')
    .eq('board_id', boardId)
    .eq('ntt_id', nttId)
    .maybeSingle()

  if (error) throw new Error(`중복 확인 실패: ${error.message}`)
  return data !== null
}

async function crawlBoard(board: BoardConfig): Promise<void> {
  console.log(`[${board.id}] 목록 조회 시작`)

  for (let pageIndex = 1; pageIndex <= MAX_PAGES; pageIndex++) {
    const items = await fetchBoardList(board, pageIndex)

    if (items.length === 0) {
      console.log(`[${board.id}] ${pageIndex}페이지에 글이 없어 순회 종료`)
      break
    }

    console.log(`[${board.id}] ${pageIndex}페이지에서 ${items.length}건 발견`)

    let pageHasNewItem = false

    for (const item of items) {
      if (await alreadyStored(board.id, item.nttId)) continue
      pageHasNewItem = true

      const detail = await fetchNoticeDetail(board, item.nttId)
      const { summary, keywords } = await summarizeNotice(detail.title, detail.content)

      const { error } = await supabase.from('notices').upsert(
        {
          board_id: board.id,
          board_name: board.name,
          ntt_id: item.nttId,
          url: buildDetailUrl(board, item.nttId),
          title: detail.title,
          summary,
          keywords,
          author: detail.author,
          published_at: detail.publishedAt,
        },
        { onConflict: 'board_id,ntt_id' },
      )

      if (error) throw new Error(`저장 실패 (${board.id}/${item.nttId}): ${error.message}`)
      console.log(`[${board.id}] 저장: ${detail.title}`)
    }

    // 이 페이지의 글이 전부 이미 저장돼 있다면, 그보다 오래된 다음 페이지도 이미 저장돼 있을 것이므로 종료
    if (!pageHasNewItem) {
      console.log(`[${board.id}] ${pageIndex}페이지가 전부 이미 저장된 글이라 순회 종료`)
      break
    }
  }
}

async function main(): Promise<void> {
  for (const board of boards) {
    try {
      await crawlBoard(board)
    } catch (err) {
      console.error(`[${board.id}] 크롤링 실패:`, err instanceof Error ? err.message : err)
    }
  }
}

main()
