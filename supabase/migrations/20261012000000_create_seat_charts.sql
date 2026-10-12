-- 선생님 1명당 자리 배치표 1개
create table public.seat_charts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique default auth.uid() references auth.users (id) on delete cascade,
  class_name text not null default '' check (char_length(class_name) <= 50),
  columns int not null default 3 check (columns between 1 and 6),
  rows int not null default 7 check (rows between 1 and 12),
  front_rows int not null default 2 check (front_rows between 1 and 12),
  students jsonb not null default '[]'::jsonb check (jsonb_typeof(students) = 'array'),
  seats jsonb not null default '[]'::jsonb check (jsonb_typeof(seats) = 'array'),
  updated_at timestamptz not null default now()
);

alter table public.seat_charts enable row level security;

revoke all on public.seat_charts from anon;
grant select, insert, update, delete on public.seat_charts to authenticated;

create policy "본인 배치표 읽기" on public.seat_charts
  for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy "본인 배치표 만들기" on public.seat_charts
  for insert to authenticated
  with check ((select auth.uid()) = owner_id);

create policy "본인 배치표 수정" on public.seat_charts
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "본인 배치표 삭제" on public.seat_charts
  for delete to authenticated
  using ((select auth.uid()) = owner_id);
