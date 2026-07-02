# likelion-idea

두 개의 독립적인 기능을 담은 프로젝트입니다.

1. **Gemma 챗봇** — OpenRouter의 `google/gemma-4-31b-it:free` 모델을 사용하는 Vite + React + TypeScript 챗봇 뼈대
2. **공지사항 크롤러** — 학교 홈페이지 공지사항 게시판을 순회하며 크롤링해 요약·키워드와 함께 Supabase에 저장하는 스크립트

## 프로젝트 구조

```
likelion-idea/
├── src/                      # 챗봇 프론트엔드 (Vite + React + TS)
│   ├── App.tsx                # 채팅 UI + OpenRouter 호출 (429 재시도 포함)
│   ├── main.tsx
│   └── vite-env.d.ts          # import.meta.env 타입 선언
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

## 1. Gemma 챗봇

- **스택**: Vite + React + TypeScript, 스타일링 없음 (뼈대만)
- **모델**: OpenRouter `google/gemma-4-31b-it:free`
- **동작**: 메시지 입력 → OpenRouter `/chat/completions` 직접 호출 → 응답 표시. 무료 티어 업스트림 혼잡(429) 대응을 위해 자동 재시도(지수 백오프) 포함
- **실행**:
  ```bash
  npm install
  npm run dev
  ```
- **필요 환경변수**: `.env`의 `VITE_OPENROUTER_API_KEY` (브라우저 번들에 포함되므로 프로토타입/학습용으로만 사용 — 프로덕션에서는 서버로 옮길 것)

## 2. 공지사항 크롤러

- **스택**: Node.js + TypeScript, `tsx`로 직접 실행 (별도 빌드 없음)
- **대상 사이트**: eGovFrame 기반 게시판 (예: 서울예술대학교 공지사항). `crawler/config/boards.json`에 게시판을 추가하면 여러 게시판으로 확장 가능
- **처리 흐름**: 게시판별 목록 조회 → 이미 저장된 글 스킵(중복 방지) → 상세 페이지 파싱 → Gemini API(`gemini-3.5-flash`)로 요약·키워드 생성 → Supabase `notices` 테이블에 upsert
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
| `npm run dev` | 챗봇 개발 서버 실행 |
| `npm run build` | 챗봇 프로덕션 빌드 |
| `npm run lint` | oxlint 전체 검사 |
| `npm run crawl` | 크롤러 1회 실행 |
| `npm run typecheck:crawler` | 크롤러 타입 체크 |
