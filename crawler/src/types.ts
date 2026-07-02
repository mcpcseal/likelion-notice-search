export type BoardConfig = {
  id: string
  name: string
  baseUrl: string
  bbsId: string
  listPath: string
  detailPath: string
}

export type NoticeListItem = {
  nttId: string
  title: string
}

export type NoticeDetail = {
  title: string
  content: string
  author: string | null
  publishedAt: string | null
}

export type Summary = {
  summary: string
  keywords: string[]
}
