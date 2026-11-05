-- 학년별 편제표(NEIS '학교교육과정 편제 및 시간배당 관리 보고서', hwp)를 올릴 수 있게 한다.
-- kind에 curriculum(scope=학년)을, 파일 형식에 hwp를 더한다. 나머지 규칙(관리자만 올리기, 고치기·지우기 없음)은 그대로다.

alter table public.plan_uploads drop constraint plan_uploads_kind_check;
alter table public.plan_uploads
  add constraint plan_uploads_kind_check check (kind in ('minutes', 'cutoffs', 'curriculum'));

alter table public.plan_uploads drop constraint plan_uploads_file_type_check;
alter table public.plan_uploads
  add constraint plan_uploads_file_type_check check (file_type in ('hwpx', 'pdf', 'xlsx', 'hwp'));

drop policy "관리자만 자료 올리기" on storage.objects;
create policy "관리자만 자료 올리기" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'plans' and public.is_admin() and lower(name) ~ '\.(hwpx|hwp|pdf|xlsx)$');
