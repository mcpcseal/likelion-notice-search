import NoticeSearch from './NoticeSearch.tsx'

function App() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-10 px-6 py-12 pb-20">
      <div className="flex flex-col gap-1">
        <span className="text-xs font-bold tracking-widest text-brand uppercase">Likelion Idea</span>
        <h1 className="text-2xl font-extrabold tracking-tight text-neutral-900">학교 공지사항 검색</h1>
      </div>

      <NoticeSearch />
    </div>
  )
}

export default App
