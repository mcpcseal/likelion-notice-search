# 학교 공지사항 크롤러 구현 계획

## 목표
학교 홈페이지의 여러 게시판을 순회하며 공지사항의 URL, 내용 요약, 핵심 키워드를 Supabase에 저장한다.

## 대상 사이트 구조 (실사이트 확인 완료)
서울예술대학교 홈페이지(`seoularts.ac.kr`)는 전자정부프레임워크(eGovFrame) 게시판을 사용한다.

- **목록 페이지**: `GET /web/cop/bbsWeb/selectBoardList.do?bbsId={bbsId}&pageIndex={n}`
  - 각 글은 `ul.normal_board > li` 안에 있고, 링크는 `fn_egov_inqire_notice('{bbsId}', '{nttId}')`로 렌더링된 JS 함수 호출이라 `href`가 아니라 인라인 스크립트 문자열에서 `nttId`를 정규식으로 추출해야 함
  - 상단 고정 공지는 `li.important`, 일반 글은 `li` (class 없음) — 둘 다 같은 방식으로 파싱
  - 페이지네이션은 `pageIndex` 쿼리 파라미터 (JS 없이 GET으로 직접 접근 가능, 세션/로그인 불필요 — curl로 검증함)
- **상세 페이지**: `GET /web/cop/bbsWeb/selectBoardDetail.do?pubDetail=Y&bbsId={bbsId}&nttId={nttId}`
  - 제목: `h4.tit`
  - 본문: `.view_content .se-contents` (리치 텍스트 HTML, 텍스트 추출 시 태그 제거 필요)
  - 작성자/작성일: `.div-th`/`.div-td` 쌍

다른 게시판을 추가할 경우 같은 eGovFrame 구조를 재사용할 가능성이 높지만, `bbsId`와 목록/상세 경로(`listPath`/`detailPath`)가 게시판마다 다를 수 있어 설정 파일로 분리한다.

## 아키텍처
```
crawler/
  PLAN.md              # 본 문서
  config/
    boards.json        # 크롤링 대상 게시판 목록 (bbsId, baseUrl, path 등)
  src/
    types.ts           # BoardConfig, NoticeListItem, NoticeDetail 타입
    fetchList.ts        # 목록 페이지 요청 + cheerio 파싱 + 페이지네이션
    fetchDetail.ts       # 상세 페이지 요청 + 본문/메타데이터 파싱
    summarize.ts         # OpenRouter LLM 호출 → 요약 + 키워드 생성
    supabaseClient.ts    # Supabase 클라이언트 (service role key)
    index.ts             # 메인 루프: boards.json 순회 → 목록 → 상세 → 요약 → upsert

supabase/
  schema.sql            # notices 테이블 DDL

.github/workflows/
  crawl.yml             # 스케줄 실행 (GitHub Actions cron)
```

## 처리 흐름
1. `boards.json`에 정의된 각 게시판을 순회
2. 게시판별로 목록 페이지 1페이지(기본값, 설정 가능)를 가져와 `nttId` 목록 추출
3. 각 `nttId`에 대해 Supabase에 이미 저장된 글(`board_id` + `ntt_id` unique)인지 확인 → 있으면 건너뜀 (중복 크롤링 방지)
4. 새 글이면 상세 페이지를 가져와 제목/본문/작성자/작성일 파싱
5. 본문을 OpenRouter LLM(`google/gemma-4-31b-it:free`)에 보내 요약 + 핵심 키워드(3~5개) 생성
   - 응답은 JSON 형식으로 강제 요청 (`{"summary": "...", "keywords": ["...", ...]}`)
   - 파싱 실패 시 요약은 본문 앞부분으로 대체, 키워드는 빈 배열 (LLM 실패가 전체 파이프라인을 막지 않도록)
6. Supabase `notices` 테이블에 upsert (`onConflict: board_id,ntt_id`)
7. 게시판 하나가 실패해도 나머지 게시판은 계속 진행 (게시판 단위 try/catch)

## Supabase 스키마
`notices` 테이블 하나로 시작 (컬럼: board_id, board_name, ntt_id, url, title, summary, keywords(text[]), author, published_at, created_at). `unique(board_id, ntt_id)`로 중복 저장 방지. 상세는 `supabase/schema.sql` 참고.

## 인증/키 관리
- `.env`(로컬)와 GitHub Actions Secrets(배포)에 다음 값 필요:
  - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (RLS 우회하고 서버에서만 쓰는 키 — 절대 클라이언트/`VITE_` 접두사로 노출 금지)
  - `OPENROUTER_API_KEY` (서버 사이드 전용, 기존 챗봇의 `VITE_OPENROUTER_API_KEY`와는 별도 변수로 관리 — 프론트엔드 번들에 섞이지 않도록)

## 실행 방식
- 로컬: `npm run crawl`
- 배포: GitHub Actions에서 cron(예: 매일 1회)으로 `npm run crawl` 실행. 워크플로 자체는 이 계획 문서와 별개로 `.github/workflows/crawl.yml`에 구현.

## 확장 시 (게시판 추가)
`boards.json`에 항목 하나만 추가하면 됨:
```json
{
  "id": "고유-식별자",
  "name": "게시판 이름",
  "baseUrl": "https://example.ac.kr",
  "bbsId": "BBSMSTR_XXXXXXXXXXXX",
  "listPath": "/web/cop/bbsWeb/selectBoardList.do",
  "detailPath": "/web/cop/bbsWeb/selectBoardDetail.do"
}
```
단, eGovFrame이 아닌 다른 게시판 시스템(그누보드, 자체 CMS 등)이라면 HTML 구조가 달라 파서를 게시판 타입별로 분기하거나 별도 파서를 추가해야 함 — 현재 구현은 eGovFrame 구조 전용.

## 스코프에서 제외한 것 (YAGNI)
- 첨부파일 다운로드/저장 (요구사항에 없음 — 필요해지면 추가)
- 재시도 큐/작업 스케줄러 프레임워크 (게시판 개수가 적어 단순 순차 실행으로 충분)
- 증분 크롤링 최적화(마지막 크롤링 이후 글만 가져오기) — 현재는 매 실행마다 최근 1페이지를 가져와 이미 있는 글은 upsert로 덮어쓰지 않고 스킵하는 것으로 충분
