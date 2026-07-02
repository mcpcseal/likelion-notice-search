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
  const items = await fetchBoardList(board)
  console.log(`[${board.id}] ${items.length}건 발견`)

  for (const item of items) {
    if (await alreadyStored(board.id, item.nttId)) continue

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
