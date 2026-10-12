-- 떨어져 앉을 학생 묶음: [[학생id, 학생id, ...], ...]
alter table public.seat_charts
  add column separations jsonb not null default '[]'::jsonb
  check (jsonb_typeof(separations) = 'array');
