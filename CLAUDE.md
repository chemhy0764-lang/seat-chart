@AGENTS.md

# seat-chart 프로젝트 지침

## 연결된 계정 (다른 프로젝트와 헷갈리지 않기)
- GitHub: https://github.com/chemhy0764-lang/seat-chart (branch `main`)
- Supabase: project ref `urzckcagikeztqmwcqez` (chemhy0764-lang's Project, ap-northeast-1), 테이블 `public.seat_charts`
- Vercel: 팀 `haeyoung1` (orgId `team_Yf6aq8E5VzXJNLZ2qvEAREWv`), projectId `prj_eHp6QEtuobBWH7uHp4aOTT0YZb7B`, 이름 `seat-chart`
- 배포 주소: https://seat-chart-one.vercel.app (분할점수 페이지는 `/cutoff`)
- 배포 방식: Vercel이 GitHub 저장소와 연결되어 있다(2026-11-05 연결). `main`에 병합하면 운영에 배포되고, PR 브랜치를 올리면 미리보기 배포가 생긴다. 그 전에는 연결이 없어 병합해도 배포되지 않았다(마지막 수동 배포 10월 12일).
- Supabase 무료 플랜은 약 1주일 접속이 없으면 프로젝트가 일시 중지된다. 중지되면 로그인과 가입이 `Failed to fetch`로 실패한다. 대시보드에서 Resume project로 다시 시작한다. `/api/keepalive`(Vercel Cron, 매일)가 중지를 막으려고 `ping()` 함수를 부른다.

- 올린 자료: `public.admins`(관리자 목록, 앱에서는 읽기만), `public.plan_uploads`(자료 기록), Storage 비공개 버킷 `plans`. 열람은 로그인한 사용자, 올리기는 관리자만, 고치기·지우기 권한은 없다(정정은 새 판 추가). 테스트는 `lib/db/plan_uploads.test.ts`(PGlite로 RLS 확인).

## 규칙
- 환경변수는 공개용 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` 두 개뿐이다. service_role/secret 키는 쓰지 않는다.
- 접근 통제는 RLS(`(select auth.uid()) = owner_id`)로만 한다. 정책을 바꾸면 비로그인·본인·타인 검사를 다시 한다.
- DB를 바꿀 때는 `supabase/migrations/`에 새 파일을 추가하고 `supabase/rollback.sql` 맨 위에 되돌리기 SQL을 적는다.
- 학생 이름·번호는 Git·테스트·로그에 넣지 않는다. 테스트에는 가짜 이름만 쓴다.
- 자리 번호: `seats[row * columns * 2 + col]`, 0번 줄이 전자칠판 앞. 배치 규칙은 `lib/seating.ts`, 테스트는 `npm test`.
