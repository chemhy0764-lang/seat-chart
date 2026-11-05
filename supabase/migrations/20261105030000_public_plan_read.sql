-- 링크만 있는 방문자(로그인 없음)가 올린 자료의 '값'을 읽어 자동 채우기에 쓸 수 있게 한다.
-- 읽을 수 있는 것: plan_uploads의 값 열(협의록 장소·참석자·기록자, 추정분할점수, 편제표 과목 등). 올린 사람(uploaded_by)은 뺀다.
-- 그대로인 것: 파일 원본(Storage plans 버킷)은 로그인한 사용자만, 올리기는 관리자만, 고치기·지우기 권한 없음.

grant select (id, kind, scope, year, semester, exam, version, file_path, file_name, file_type, parsed, note, uploaded_at)
  on public.plan_uploads to anon;

create policy "누구나 자료 값 읽기" on public.plan_uploads
  for select to anon
  using (true);
