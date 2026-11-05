import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

// 실제 Supabase 대신 PGlite(브라우저·Node에서 도는 PostgreSQL)에 Supabase의 역할·auth·storage 모양을 흉내 내고,
// 마이그레이션을 그대로 실행해 보안 규칙(RLS)이 의도대로인지 확인한다.

const ADMIN = "00000000-0000-0000-0000-0000000000a1";
const TEACHER = "00000000-0000-0000-0000-0000000000b1";
const OTHER = "00000000-0000-0000-0000-0000000000c1";

const db = new PGlite();

type Who = "postgres" | "anon" | "authenticated";
async function as(who: Who, uid = "") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid]);
  if (who !== "postgres") await db.exec(`set role ${who}`);
}

async function rejects(fn: () => Promise<unknown>, pattern = /permission denied|row-level security|violates/) {
  await assert.rejects(fn, (e: Error) => pattern.test(e.message), "거부되어야 해요");
}

const count = async (table: string) => (await db.query<{ c: number }>(`select count(*)::int c from ${table}`)).rows[0].c;

const upload = (version = 1, scope = "과학", by = ADMIN) =>
  db.query(
    `insert into public.plan_uploads (kind, scope, year, semester, exam, version, file_path, file_name, file_type, uploaded_by)
     values ('minutes', $1, 2026, 2, '', $2, $3, '협의록.hwpx', 'hwpx', $4)`,
    [scope, version, `minutes/${scope}-${version}.hwpx`, by],
  );

before(async () => {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    grant usage on schema public to anon, authenticated;
    -- Supabase는 새 public 표에 anon·authenticated 권한을 기본으로 준다. 마이그레이션의 revoke가 실제로 먹는지 보려고 똑같이 한다.
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant execute on functions to anon, authenticated;
    -- storage 흉내
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text, owner uuid default auth.uid());
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon, authenticated;
    grant all on storage.objects to anon, authenticated;
    insert into auth.users values ('${ADMIN}'), ('${TEACHER}'), ('${OTHER}');
  `);
  await db.exec(readFileSync(new URL("../../supabase/migrations/20261105010000_plan_uploads.sql", import.meta.url), "utf8"));
  await db.exec(readFileSync(new URL("../../supabase/migrations/20261105020000_curriculum_uploads.sql", import.meta.url), "utf8"));
  await db.query("insert into public.admins (user_id) values ($1)", [ADMIN]);
});

test("관리자 여부: 본인 것만 읽히고 앱에서는 바꿀 수 없다", async () => {
  await as("authenticated", ADMIN);
  assert.equal((await db.query<{ v: boolean }>("select public.is_admin() as v")).rows[0].v, true);
  assert.equal(await count("public.admins"), 1);
  await as("authenticated", TEACHER);
  assert.equal((await db.query<{ v: boolean }>("select public.is_admin() as v")).rows[0].v, false);
  assert.equal(await count("public.admins"), 0);
  await rejects(() => db.query("insert into public.admins (user_id) values ($1)", [TEACHER]));
  await as("authenticated", ADMIN);
  await rejects(() => db.query("insert into public.admins (user_id) values ($1)", [OTHER]));
  await rejects(() => db.query("delete from public.admins"));
  await as("anon");
  await rejects(() => db.query("select * from public.admins"));
  await rejects(() => db.query("select public.is_admin()"));
});

test("자료 기록: 관리자만 올리고, 로그인한 사용자는 모두 읽는다", async () => {
  await as("authenticated", ADMIN);
  await upload(1);
  await as("authenticated", TEACHER);
  await rejects(() => upload(2, "과학", TEACHER));
  assert.equal(await count("public.plan_uploads"), 1);
  await as("anon");
  await rejects(() => db.query("select * from public.plan_uploads"));
  await rejects(() => upload(3, "과학", ADMIN));
});

test("관리자라도 남의 이름으로는 올릴 수 없다", async () => {
  await as("authenticated", ADMIN);
  await rejects(() => upload(5, "수학", TEACHER));
});

test("한 번 올린 자료는 고치거나 지울 수 없고, 정정은 새 판으로 추가한다", async () => {
  await as("authenticated", ADMIN);
  await rejects(() => db.query("update public.plan_uploads set note = '바꿈'"));
  await rejects(() => db.query("delete from public.plan_uploads"));
  await rejects(() => upload(1), /duplicate key|unique/);
  await upload(2);
  const rows = (await db.query<{ version: number }>("select version from public.plan_uploads where scope = '과학' order by version desc")).rows;
  assert.deepEqual(rows.map((r) => r.version), [2, 1]);
});

test("값 검사: 잘못된 종류·학기·파일 형식·parsed는 거부된다", async () => {
  await as("authenticated", ADMIN);
  const bad = (set: string) => db.query(`insert into public.plan_uploads (kind, scope, year, semester, version, file_path, file_name, file_type) values (${set})`);
  await rejects(() => bad("'etc','x',2026,1,1,'p','n','hwpx'"));
  await rejects(() => bad("'minutes','x',2026,3,1,'p','n','hwpx'"));
  await rejects(() => bad("'minutes','x',2026,1,0,'p','n','hwpx'"));
  await rejects(() => bad("'minutes','x',2026,1,1,'p','n','exe'"));
  await rejects(() => db.query(`insert into public.plan_uploads (kind, scope, year, semester, version, file_path, file_name, file_type, parsed) values ('minutes','y',2026,1,1,'p','n','hwpx','[]')`));
});

test("파일 저장소: 관리자만 올리고, 로그인한 사용자는 읽고, 아무도 고치거나 지울 수 없다", async () => {
  await as("postgres");
  const put = (name: string, bucket = "plans") => db.query("insert into storage.objects (bucket_id, name) values ($1, $2)", [bucket, name]);
  await as("authenticated", ADMIN);
  await put("minutes/a.hwpx");
  await put("cutoffs/b.XLSX");
  await put("minutes/c.pdf");
  await rejects(() => put("minutes/d.exe"));
  await rejects(() => put("minutes/e.hwpx", "other-bucket"));
  await as("authenticated", TEACHER);
  await rejects(() => put("minutes/f.hwpx"));
  assert.equal(await count("storage.objects"), 3);
  await as("authenticated", ADMIN);
  const upd = await db.query("update storage.objects set name = 'minutes/z.hwpx'");
  assert.equal(upd.affectedRows, 0, "고치기는 한 줄도 적용되면 안 돼요");
  const del = await db.query("delete from storage.objects");
  assert.equal(del.affectedRows, 0, "지우기는 한 줄도 적용되면 안 돼요");
  await as("anon");
  assert.equal(await count("storage.objects"), 0);
  await rejects(() => put("minutes/g.hwpx"));
});

test("편제표(curriculum, hwp): 관리자만 올리고 로그인한 사용자는 읽는다", async () => {
  const curriculum = (by: string) =>
    db.query(
      `insert into public.plan_uploads (kind, scope, year, semester, version, file_path, file_name, file_type, uploaded_by)
       values ('curriculum', '1', 2026, 2, 1, 'curriculum/a.hwp', '편제표.hwp', 'hwp', $1)`,
      [by],
    );
  await as("authenticated", TEACHER);
  await rejects(() => curriculum(TEACHER));
  await as("authenticated", ADMIN);
  await curriculum(ADMIN);
  await rejects(() => db.query("delete from public.plan_uploads where kind = 'curriculum'"));
  await as("authenticated", TEACHER);
  assert.equal((await db.query<{ c: number }>("select count(*)::int c from public.plan_uploads where kind = 'curriculum'")).rows[0].c, 1);
  await as("authenticated", ADMIN);
  await db.query("insert into storage.objects (bucket_id, name) values ('plans', 'curriculum/b.hwp')");
  await rejects(() => db.query("insert into storage.objects (bucket_id, name) values ('plans', 'curriculum/c.exe')"));
  await as("authenticated", TEACHER);
  await rejects(() => db.query("insert into storage.objects (bucket_id, name) values ('plans', 'curriculum/d.hwp')"));
});
