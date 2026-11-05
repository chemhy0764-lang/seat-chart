-- 무료 플랜의 일시 중지를 막으려고 주기적으로 부르는 확인용 함수. 데이터는 읽지도 쓰지도 않고 1만 돌려준다.
create or replace function public.ping()
returns int
language sql
stable
as $$ select 1 $$;

revoke all on function public.ping() from public;
grant execute on function public.ping() to anon, authenticated;
