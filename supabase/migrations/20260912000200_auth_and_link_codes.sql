-- Phase 4: 카카오 로그인 연동 준비

-- 1) auth.users에 신규 가입(카카오 로그인) 시 public.users row 자동 생성
--    Kakao provider가 raw_user_meta_data에 채우는 정확한 키가 문서상 보장되지 않아
--    여러 후보 키를 coalesce로 방어적으로 처리한다.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, kakao_account_id, nickname, profile_image_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'provider_id', new.raw_user_meta_data->>'sub'),
    coalesce(
      new.raw_user_meta_data->>'name',
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'user_name',
      new.raw_user_meta_data->>'nickname'
    ),
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- 2) link_codes.bot_user_key: 발급 시점엔 알 수 없으므로 nullable로 변경
--    (챗봇에서 코드를 맞추는 시점에 실제 kakao_bot_user_key를 채워 감사 로그로 남긴다)
alter table public.link_codes
  alter column bot_user_key drop not null;

-- 3) link_codes RLS: anon key로 임의 user_id의 코드를 만들 수 없도록 방어
alter table public.link_codes enable row level security;

create policy "link_codes_select_own" on public.link_codes
  for select using (auth.uid() = user_id);

create policy "link_codes_insert_own" on public.link_codes
  for insert with check (auth.uid() = user_id);
