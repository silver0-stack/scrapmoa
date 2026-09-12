-- Phase 1: 초기 스키마 (카톡 스크랩)
-- 무료 티어: Supabase Postgres 내장 확장만 사용, 별도 유료 확장 없음

create extension if not exists "pgcrypto";

create type link_status as enum ('pending', 'processed', 'failed', 'restricted', 'quota_exceeded');

-- users
-- id는 Supabase Auth의 auth.users.id와 동일하게 맞춘다 (Phase 4 카카오 로그인 연동 전제).
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  kakao_account_id text unique,
  nickname text,
  profile_image_url text,
  created_at timestamptz not null default now()
);

-- bot_identities
create table if not exists public.bot_identities (
  id uuid primary key default gen_random_uuid(),
  kakao_bot_user_key text unique not null,
  user_id uuid references public.users(id) on delete set null,
  linked_at timestamptz,
  created_at timestamptz not null default now()
);

-- link_codes (대시보드 발급 6자리 연동 코드)
create table if not exists public.link_codes (
  code varchar(6) primary key,
  bot_user_key text not null,
  user_id uuid not null references public.users(id) on delete cascade,
  expires_at timestamptz not null,
  used boolean not null default false
);

-- links
create table if not exists public.links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  raw_url text not null,
  resolved_url text,
  source_domain text,
  title text,
  summary text,
  category text,
  tags text[] not null default '{}',
  thumbnail_url text,
  status link_status not null default 'pending',
  is_read boolean not null default false,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

-- processing_failures
create table if not exists public.processing_failures (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.links(id) on delete cascade,
  error_type text not null,
  error_detail text,
  retry_count integer not null default 0,
  created_at timestamptz not null default now()
);

-- 조회 성능용 인덱스
create index if not exists idx_links_user_id on public.links(user_id);
create index if not exists idx_links_status on public.links(status);
create index if not exists idx_bot_identities_user_id on public.bot_identities(user_id);
create index if not exists idx_processing_failures_link_id on public.processing_failures(link_id);
create index if not exists idx_link_codes_bot_user_key on public.link_codes(bot_user_key);

-- RLS: links, users에 auth.uid() 기반 정책 적용
-- (챗봇 웹훅/크론 등 서버 로직은 service role 키로 접근하므로 RLS 영향을 받지 않는다)
alter table public.users enable row level security;
alter table public.links enable row level security;

create policy "users_select_own" on public.users
  for select using (auth.uid() = id);

create policy "users_update_own" on public.users
  for update using (auth.uid() = id);

create policy "users_insert_own" on public.users
  for insert with check (auth.uid() = id);

create policy "links_select_own" on public.links
  for select using (auth.uid() = user_id);

create policy "links_insert_own" on public.links
  for insert with check (auth.uid() = user_id);

create policy "links_update_own" on public.links
  for update using (auth.uid() = user_id);

create policy "links_delete_own" on public.links
  for delete using (auth.uid() = user_id);
