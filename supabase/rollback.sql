-- 되돌리기는 위에서부터 순서대로 실행한다.

-- 20261105010000_plan_uploads 되돌리기 (올린 자료 기록과 관리자 목록이 지워진다. 파일은 대시보드 Storage의 plans 버킷에서 따로 지운다)
drop policy if exists "관리자만 자료 올리기" on storage.objects;
drop policy if exists "로그인한 사용자 자료 읽기" on storage.objects;
drop table if exists public.plan_uploads;
drop function if exists public.is_admin();
drop table if exists public.admins;

-- 20261105000000_add_ping 되돌리기
drop function if exists public.ping();

-- 20261012010000_add_separations 되돌리기
alter table public.seat_charts drop column if exists separations;

-- 20261012000000_create_seat_charts 되돌리기 (저장된 배치표도 함께 지워짐)
drop table if exists public.seat_charts;
