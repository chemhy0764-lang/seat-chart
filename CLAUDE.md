@AGENTS.md

# seat-chart 프로젝트 지침

## 연결된 계정 (다른 프로젝트와 헷갈리지 않기)
- GitHub: https://github.com/chemhy0764-lang/seat-chart (branch `main`)
- Supabase: project ref `urzckcagikeztqmwcqez` (chemhy0764-lang's Project, ap-northeast-1), 테이블 `public.seat_charts`
- Vercel: 팀 `haeyoung1` (orgId `team_Yf6aq8E5VzXJNLZ2qvEAREWv`), projectId `prj_eHp6QEtuobBWH7uHp4aOTT0YZb7B`, 이름 `seat-chart`

## 규칙
- 환경변수는 공개용 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` 두 개뿐이다. service_role/secret 키는 쓰지 않는다.
- 접근 통제는 RLS(`(select auth.uid()) = owner_id`)로만 한다. 정책을 바꾸면 비로그인·본인·타인 검사를 다시 한다.
- DB를 바꿀 때는 `supabase/migrations/`에 새 파일을 추가하고 `supabase/rollback.sql` 맨 위에 되돌리기 SQL을 적는다.
- 학생 이름·번호는 Git·테스트·로그에 넣지 않는다. 테스트에는 가짜 이름만 쓴다.
- 자리 번호: `seats[row * columns * 2 + col]`, 0번 줄이 전자칠판 앞. 배치 규칙은 `lib/seating.ts`, 테스트는 `npm test`.
