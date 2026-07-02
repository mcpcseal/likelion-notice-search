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
