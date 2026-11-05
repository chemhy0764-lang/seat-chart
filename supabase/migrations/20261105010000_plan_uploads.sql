-- 관리자가 올리는 자료(평가계획서 교과별 협의록, 학년별 추정분할점수 파일)와 그 기록.
-- 열람은 로그인한 사용자 모두, 올리기는 관리자만. 한 번 올린 자료는 지우거나 고치지 않고, 정정은 새 판(version)으로 추가한다.

-- 관리자 목록. 앱에서는 자기 행을 읽기만 하고, 관리자 추가는 Supabase SQL Editor에서만 한다.
create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

alter table public.admins enable row level security;

revoke all on public.admins from anon, authenticated;
grant select on public.admins to authenticated;

create policy "본인의 관리자 여부 읽기" on public.admins
  for select to authenticated
  using ((select auth.uid()) = user_id);

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()))
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- 올린 자료 기록. kind: minutes(교과별 협의록, scope=교과) / cutoffs(학년별 추정분할점수, scope=학년, exam=1차·2차·수행)
create table public.plan_uploads (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('minutes', 'cutoffs')),
  scope text not null check (char_length(scope) between 1 and 40),
  year int not null check (year between 2000 and 2100),
  semester int not null check (semester in (1, 2)),
  exam text not null default '' check (char_length(exam) <= 20),
  version int not null check (version >= 1),
  file_path text not null check (char_length(file_path) <= 200),
  file_name text not null check (char_length(file_name) <= 200),
  file_type text not null check (file_type in ('hwpx', 'pdf', 'xlsx')),
  parsed jsonb not null default '{}'::jsonb check (jsonb_typeof(parsed) = 'object'),
  note text not null default '' check (char_length(note) <= 500),
  uploaded_by uuid not null default auth.uid() references auth.users (id),
  uploaded_at timestamptz not null default now()
);

create unique index plan_uploads_version_key
  on public.plan_uploads (kind, scope, year, semester, exam, version);

alter table public.plan_uploads enable row level security;

revoke all on public.plan_uploads from anon;
-- 고치기(update)와 지우기(delete) 권한은 주지 않는다: 한 번 올린 자료는 사라지지 않는다.
revoke all on public.plan_uploads from authenticated;
grant select, insert on public.plan_uploads to authenticated;

create policy "로그인한 사용자 읽기" on public.plan_uploads
  for select to authenticated
  using (true);

create policy "관리자만 올리기" on public.plan_uploads
  for insert to authenticated
  with check (public.is_admin() and uploaded_by = (select auth.uid()));

-- 파일 저장소: 비공개 버킷. 읽기는 로그인한 사용자, 올리기는 관리자만, 고치기·지우기 정책은 만들지 않는다.
insert into storage.buckets (id, name, public, file_size_limit)
values ('plans', 'plans', false, 20971520)
on conflict (id) do nothing;

create policy "로그인한 사용자 자료 읽기" on storage.objects
  for select to authenticated
  using (bucket_id = 'plans');

create policy "관리자만 자료 올리기" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'plans' and public.is_admin() and lower(name) ~ '\.(hwpx|pdf|xlsx)$');
