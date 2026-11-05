# 자리 배치표

짝꿍(2인) 분단형 교실의 자리 배치표를 만드는 웹앱입니다.

- 선생님 이메일+비밀번호 로그인, 선생님마다 배치표 1개 저장 (Supabase, RLS로 본인 것만 접근)
- 학생 명단 붙여넣기, 무작위 섞기, 끌어서 자리 바꾸기
- 앞줄 우선 학생, 떨어져 앉을 학생 묶음 (짝·앞뒤·옆·대각선 금지)
- 인쇄: 1쪽 전자칠판이 위, 2쪽 180° 돌린 모습
- 분할점수 점검(`/cutoff`): NEIS 입력 전에 예상정답률·수행평가 분할점수 규칙을 검사. 절차는 `docs/cutoff-scores.md`

## 개발

```bash
npm install
npm run dev     # .env.local 에 NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY 필요
npm test        # 자리 배치 로직 테스트
```

DB 변경은 `supabase/migrations/`, 되돌리기는 `supabase/rollback.sql` 에 있습니다.

## Supabase 무료 플랜이 일시 중지될 때

무료 플랜은 약 1주일 접속이 없으면 프로젝트가 일시 중지되어 로그인과 가입이 `Failed to fetch`로 실패합니다.

- 예방: `vercel.json`의 Cron이 하루 한 번 `/api/keepalive`를 호출해 데이터베이스에 가벼운 요청(`ping()` 함수)을 보냅니다. `supabase/migrations/20261105000000_add_ping.sql`을 한 번 실행해 두어야 합니다.
- 이미 중지되었다면: Supabase 대시보드에서 프로젝트의 "Resume project"(한국어 번역으로는 "이력서 프로젝트")를 눌러 다시 시작합니다. 중지 후 일정 기간 안에만 가능합니다.
