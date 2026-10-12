-- 되돌리기는 위에서부터 순서대로 실행한다.

-- 20261012010000_add_separations 되돌리기
alter table public.seat_charts drop column if exists separations;

-- 20261012000000_create_seat_charts 되돌리기 (저장된 배치표도 함께 지워짐)
drop table if exists public.seat_charts;
