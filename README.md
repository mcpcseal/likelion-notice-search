# likelion-idea

두 개의 독립적인 기능을 담은 프로젝트입니다.

1. **공지사항 검색 챗봇** — 크롤링된 공지사항을 자연어 대화로 검색하는 Vite + React + TypeScript + Tailwind CSS 앱 (Gemini 활용)
2. **공지사항 크롤러** — 학교 홈페이지 공지사항 게시판을 순회하며 크롤링해 요약·키워드와 함께 Supabase에 저장하는 스크립트

## 프로젝트 구조

```
likelion-idea/
├── src/                      # 검색 챗봇 프론트엔드 (Vite + React + TS + Tailwind)
│   ├── App.tsx                 # 페이지 셸
│   ├── Chatbot.tsx              # 대화형 챗봇 UI (실제 사용되는 메인 화면)
│   ├── NoticeSearch.tsx        # 단발 질문형 검색 UI (레거시, 현재 App에서 미사용)
│   ├── lib/
│   │   ├── geminiClient.ts       # 프론트엔드용 Gemini 클라이언트
│   │   ├── supabaseClient.ts     # 프론트엔드용 Supabase 클라이언트 (publishable key)
│   │   └── notices.ts            # 키워드 추출 → 관련성 기반 검색 → 답변 합성 로직
│   ├── main.tsx
│   ├── index.css               # Tailwind 진입점 + 브랜드 컬러(#d81921) 테마
│   └── vite-env.d.ts           # import.meta.env 타입 선언
├── index.html
│
├── crawler/                  # 공지사항 크롤러 (Node + TS 스크립트)
│   ├── PLAN.md                 # 구현 계획 문서 (사이트 구조 분석 포함)
│   ├── config/
│   │   └── boards.json         # 크롤링 대상 게시판 목록
│   ├── src/
│   │   ├── types.ts            # BoardConfig, NoticeListItem, NoticeDetail 등 타입
│   │   ├── fetchList.ts        # 목록 페이지 요청 + 파싱 + 페이지네이션
│   │   ├── fetchDetail.ts      # 상세 페이지 요청 + 본문/메타데이터 파싱
│   │   ├── summarize.ts        # Gemini API 호출 → 요약 + 키워드 생성
│   │   ├── supabaseClient.ts   # Supabase 클라이언트 (publishable key)
│   │   └── index.ts            # 메인 루프: 게시판 순회 → 목록 → 상세 → 요약 → upsert
│   └── tsconfig.json
│
├── supabase/
│   └── schema.sql             # notices 테이블 DDL + RLS 정책
│
├── .github/workflows/
│   └── crawl.yml               # 크롤러 스케줄 실행 (GitHub Actions cron)
│
├── .env / .env.example        # 환경변수 (실제 키는 git에 커밋되지 않음)
└── package.json
```

## 1. 공지사항 검색 챗봇

- **스택**: Vite + React + TypeScript + Tailwind CSS v4 (브랜드 컬러 `#d81921`)
- **동작**: 대화형 입력 → (1) Gemini로 이전 대화 맥락을 반영해 검색 키워드 추출 → (2) Supabase `notices` 테이블에서 제목/요약 매칭 검색 후 매칭 키워드 길이 기준 관련성 순으로 재정렬 → (3) Gemini가 검색 결과를 근거로 200자 이내 자연어 답변 생성(문장 단위로 자연스럽게 truncate) → 답변 + 관련 공지사항 카드(상위 3개, 더보기로 확장) 표시
- **UX 세부사항**: 입력창에서 ↑/↓로 이전에 보낸 메시지 재입력 가능, 에러 발생 시 사용자에게는 안내 메시지만 노출하고 실제 에러는 브라우저 콘솔에 기록
- **실행**:
  ```bash
  npm install
  npm run dev
  ```
- **필요 환경변수**: `.env`의 `VITE_GEMINI_API_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (모두 VITE_ 접두사라 브라우저 번들에 포함됨 — Supabase publishable key는 공개돼도 안전하도록 설계된 키지만, Gemini 키는 일반 API 키이므로 프로토타입/학습용으로만 사용할 것)

## 2. 공지사항 크롤러

- **스택**: Node.js + TypeScript, `tsx`로 직접 실행 (별도 빌드 없음)
- **대상 사이트**: eGovFrame 기반 게시판 (예: 서울예술대학교 공지사항). `crawler/config/boards.json`에 게시판을 추가하면 여러 게시판으로 확장 가능
- **처리 흐름**: 게시판별 목록 조회 → 이미 저장된 글 스킵(중복 방지) → 상세 페이지 파싱 → Gemini API(`gemini-2.5-flash-lite`)로 요약·키워드 생성 → Supabase `notices` 테이블에 upsert
- **저장 방식**: Supabase publishable key로 접속하며, `supabase/schema.sql`에 anon insert/update RLS 정책이 포함되어 있음
- **실행**:
  ```bash
  npm run crawl                # 로컬에서 1회 실행
  npm run typecheck:crawler    # 크롤러 타입 체크
  ```
- **자동화**: `.github/workflows/crawl.yml`이 매일 07:00 KST에 GitHub Actions로 실행 (또는 수동 트리거)
- **필요 환경변수**: `.env`의 `GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (GitHub Actions에서 쓰려면 리포 Secrets에도 동일하게 등록)
- **Supabase 준비**: Supabase 프로젝트 생성 후 SQL Editor에서 `supabase/schema.sql` 실행 필요 (이 저장소에는 스키마 정의만 있고, 실제 프로젝트 인스턴스 생성은 직접 해야 함)

자세한 설계 배경(사이트 HTML 구조 분석, 설계 결정 이유 등)은 [`crawler/PLAN.md`](./crawler/PLAN.md) 참고.

## 공통 스크립트

| 명령 | 설명 |
| --- | --- |
| `npm run dev` | 검색 프론트엔드 개발 서버 실행 |
| `npm run build` | 프론트엔드 프로덕션 빌드 |
| `npm run lint` | oxlint 전체 검사 |
| `npm run crawl` | 크롤러 1회 실행 |
| `npm run typecheck:crawler` | 크롤러 타입 체크 |
