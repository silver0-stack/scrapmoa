-- Phase 2: links.bot_identity_id 추가
-- 이유: 로그인 전(user_id가 null인 상태)에 저장된 링크도 "어떤 봇 사용자가 보냈는지"를
-- 기록해둬야, Phase 4에서 연동 코드 입력 시 bot_identities.user_id 갱신에 맞춰
-- 해당 봇 사용자가 보낸 링크들의 user_id를 소급으로 일괄 업데이트할 수 있다.

alter table public.links
  add column if not exists bot_identity_id uuid references public.bot_identities(id) on delete set null;

-- 기존에 이미 웹훅으로 들어온 행이 없다는 전제 하에 not null로 강제한다.
-- (신규 프로젝트라 데이터가 없으므로 바로 not null 적용 가능)
alter table public.links
  alter column bot_identity_id set not null;

create index if not exists idx_links_bot_identity_id on public.links(bot_identity_id);
