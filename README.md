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

## 올린 자료 보관(자료 첨부 탭)

관리자가 평가계획서 교과별 협의록과 학년별 추정분할점수 파일(hwpx, xlsx, pdf)을 올려 두면, 안내·공지 탭에서 불러와 칸을 채웁니다.

- 열람은 로그인한 사용자 모두, 올리기는 관리자만 할 수 있습니다. 올린 자료는 지우거나 고칠 수 없고, 정정은 새 판으로 추가됩니다.
- 처음 설정(Supabase SQL Editor에서 한 번):
  1. `supabase/migrations/20261105010000_plan_uploads.sql`의 내용을 실행합니다.
  2. 관리자를 등록합니다. 아래 `관리자 이메일`을 본인 이메일로 바꿔 실행합니다.

     ```sql
     insert into public.admins (user_id)
     select id from auth.users where email = '관리자 이메일';
     ```
- 회원가입이 열려 있으면 가입한 누구나 올라온 자료를 볼 수 있습니다. 협의록에는 선생님 이름이 들어 있으니, 선생님 계정을 만든 뒤 Supabase 대시보드의 Authentication, Sign In / Providers에서 새 사용자 가입을 끄는 것을 권합니다.
- PDF는 올려 보관만 하고 글자는 자동으로 읽지 않습니다(값은 직접 입력).

