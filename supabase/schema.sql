-- 학교 공지사항 크롤러: notices 테이블
-- Supabase SQL Editor에서 실행

create table if not exists notices (
  id uuid primary key default gen_random_uuid(),
  board_id text not null,
  board_name text not null,
  ntt_id text not null,
  url text not null,
  title text not null,
  summary text,
  keywords text[] not null default '{}',
  author text,
  published_at date,
  created_at timestamptz not null default now(),
  unique (board_id, ntt_id)
);

create index if not exists notices_board_id_idx on notices (board_id);
create index if not exists notices_published_at_idx on notices (published_at desc);

alter table notices enable row level security;

create policy "notices are publicly readable"
  on notices for select
  using (true);

-- 크롤러가 퍼블리셔블 키(anon role)로 쓰기 때문에 insert/update를 허용한다.
-- 주의: 퍼블리셔블 키는 공개해도 안전하도록 설계된 키라, 이 정책은 키를 아는 누구나
-- notices 테이블에 쓸 수 있게 만든다. 더 안전하게 하려면 시크릿 키(서비스 롤) 사용을 권장.
create policy "anon can insert notices"
  on notices for insert
  to anon
  with check (true);

create policy "anon can update notices"
  on notices for update
  to anon
  using (true)
  with check (true);
