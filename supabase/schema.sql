-- =========================================================
-- 우리 반 공용 물품 관리 앱 — Supabase 스키마
--
-- 쓰는 법:
--   Supabase 대시보드 → 왼쪽 메뉴 SQL Editor → New query
--   → 이 파일 전체를 붙여넣고 Run
--
-- 여러 번 실행해도 안전하도록 짰습니다.
-- =========================================================


-- ---------------------------------------------------------
-- 1. items 테이블
-- ---------------------------------------------------------
create table if not exists public.items (
  id          uuid        primary key default gen_random_uuid(),

  -- 물품 이름 (1~30자, 공백만은 안 됨)
  name        text        not null
              check (char_length(btrim(name)) between 1 and 30),

  -- 카테고리 (PRD 에서 정한 네 가지로 고정)
  category    text        not null
              check (category in ('문구류', '전자기기', '청소용품', '기타')),

  -- 수량 (0 이상)
  quantity    integer     not null default 0
              check (quantity >= 0),

  -- 등록자 닉네임 (1~10자)
  owner       text        not null
              check (char_length(btrim(owner)) between 1 and 10),

  -- 수정 시간 (아래 트리거가 자동으로 갱신)
  updated_at  timestamptz not null default now()
);

-- 목록을 늘 '수정 시간 최신순'으로 읽으므로 인덱스를 둔다
create index if not exists items_updated_at_idx
  on public.items (updated_at desc);

comment on table public.items is '동아리·실습실 공용 물품 목록';


-- ---------------------------------------------------------
-- 2. 수정 시간 자동 갱신 트리거
--    앱이 깜빡하고 안 보내도 서버가 알아서 채운다
-- ---------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''      -- 함수 안에서 이름을 가로채지 못하게 막는다
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists items_set_updated_at on public.items;
create trigger items_set_updated_at
  before update on public.items
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------
-- 3. 수량 늘리기 / 줄이기 함수
--
--    "읽어서 +1 하고 다시 쓰기" 를 앱에서 하면,
--    두 사람이 동시에 누를 때 한 번이 사라진다.
--    (둘 다 5 를 읽고 둘 다 6 을 써서 7 이 안 된다)
--    그래서 DB 안에서 한 번에 처리한다. 0 미만도 여기서 막는다.
-- ---------------------------------------------------------
create or replace function public.change_quantity(item_id uuid, delta integer)
returns public.items
language sql
set search_path = ''      -- 함수 안에서 이름을 가로채지 못하게 막는다
as $$
  update public.items
     set quantity = greatest(quantity + delta, 0)
   where id = item_id
  returning *;
$$;

grant execute on function public.change_quantity(uuid, integer) to anon, authenticated;


-- ---------------------------------------------------------
-- 4. 접근 정책 (RLS)
--
--    이 앱은 로그인이 없다. 그래서 로그인하지 않은 방문자(anon)도
--    읽기·추가·수정·삭제를 모두 할 수 있게 연다.
--
--    ⚠ 주의: 주소와 publishable 키를 아는 사람은 누구나 이 표의 내용을
--       읽고, 고치고, 전부 지울 수 있습니다. 공개 저장소에 키가
--       올라가면 인터넷의 누구나 해당됩니다. 감수하고 쓰는 설정입니다.
-- ---------------------------------------------------------
alter table public.items enable row level security;

drop policy if exists "누구나 읽기"   on public.items;
drop policy if exists "누구나 추가"   on public.items;
drop policy if exists "누구나 수정"   on public.items;
drop policy if exists "누구나 삭제"   on public.items;

create policy "누구나 읽기" on public.items
  for select to anon, authenticated
  using (true);

create policy "누구나 추가" on public.items
  for insert to anon, authenticated
  with check (true);

create policy "누구나 수정" on public.items
  for update to anon, authenticated
  using (true) with check (true);

create policy "누구나 삭제" on public.items
  for delete to anon, authenticated
  using (true);


-- ---------------------------------------------------------
-- 5. 확인용 — 실행하면 정책 4개가 보여야 한다
-- ---------------------------------------------------------
-- select policyname, cmd, roles from pg_policies
--  where schemaname = 'public' and tablename = 'items';
