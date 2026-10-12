# 자리 배치표

짝꿍(2인) 분단형 교실의 자리 배치표를 만드는 웹앱입니다.

- 선생님 이메일+비밀번호 로그인, 선생님마다 배치표 1개 저장 (Supabase, RLS로 본인 것만 접근)
- 학생 명단 붙여넣기, 무작위 섞기, 끌어서 자리 바꾸기
- 앞줄 우선 학생, 떨어져 앉을 학생 묶음 (짝·앞뒤·옆·대각선 금지)
- 인쇄: 1쪽 전자칠판이 위, 2쪽 180° 돌린 모습

## 개발

```bash
npm install
npm run dev     # .env.local 에 NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY 필요
npm test        # 자리 배치 로직 테스트
```

DB 변경은 `supabase/migrations/`, 되돌리기는 `supabase/rollback.sql` 에 있습니다.
