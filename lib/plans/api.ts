import { createClient } from "../supabase/client";
import { fileTypeOf, type FileType } from "./extract";

export type PlanKind = "minutes" | "cutoffs" | "curriculum";

export type PlanRow = {
  id: string;
  kind: PlanKind;
  /** 협의록은 교과, 추정분할점수와 편제표는 학년('1','2','3') */
  scope: string;
  year: number;
  semester: number;
  /** 추정분할점수의 시험 구분: '1차', '2차', '수행'. 협의록은 빈 글자 */
  exam: string;
  version: number;
  file_path: string;
  file_name: string;
  file_type: FileType;
  parsed: Record<string, unknown>;
  note: string;
  uploaded_at: string;
};

const COLUMNS = "id, kind, scope, year, semester, exam, version, file_path, file_name, file_type, parsed, note, uploaded_at";
const BUCKET = "plans";

function explain(error: { code?: string; message?: string }): Error {
  if (error.code === "42501" || /row-level security|permission denied/i.test(error.message ?? "")) {
    return new Error("관리자만 자료를 올릴 수 있어요. 관리자로 등록된 계정으로 로그인했는지 확인하세요.");
  }
  if (error.code === "42P01" || /relation .* does not exist|schema cache/i.test(error.message ?? "")) {
    return new Error("자료 보관 표가 아직 만들어지지 않았어요. 설정(SQL 실행)이 끝났는지 확인하세요.");
  }
  return new Error(error.message || "요청하지 못했어요.");
}

/** 지금 로그인한 계정이 관리자인지. admins 표는 본인 행만 읽히므로 행이 보이면 관리자다. */
export async function fetchIsAdmin(): Promise<boolean> {
  const { data, error } = await createClient().from("admins").select("user_id").limit(1);
  return !error && (data?.length ?? 0) > 0;
}

/** 학기의 올린 자료를 모두(모든 판) 가져온다. 최신 판이 앞에 온다. */
export async function listPlans(kind: PlanKind, year: number, semester: number): Promise<PlanRow[]> {
  const { data, error } = await createClient()
    .from("plan_uploads")
    .select(COLUMNS)
    .eq("kind", kind)
    .eq("year", year)
    .eq("semester", semester)
    .order("scope", { ascending: true })
    .order("exam", { ascending: true })
    .order("version", { ascending: false });
  if (error) throw explain(error);
  return (data ?? []) as PlanRow[];
}

/**
 * 자료의 최신 판. fallback이 true면 같은 학기에 없을 때 같은 교과·학년·시험 구분의 가장 최근 학기 자료를 쓴다
 * (협의록의 장소·참석자처럼 학기가 바뀌어도 참고할 만한 값에만 쓰고, 분할점수에는 쓰지 않는다).
 */
export async function latestPlan(
  kind: PlanKind,
  scope: string,
  year: number,
  semester: number,
  exam = "",
  fallback = false,
): Promise<PlanRow | null> {
  const supabase = createClient();
  const base = () => supabase.from("plan_uploads").select(COLUMNS).eq("kind", kind).eq("scope", scope).eq("exam", exam);
  const exact = await base().eq("year", year).eq("semester", semester).order("version", { ascending: false }).limit(1);
  if (exact.error) throw explain(exact.error);
  const hit = ((exact.data ?? [])[0] as PlanRow | undefined) ?? null;
  if (hit || !fallback) return hit;
  const any = await base()
    .order("year", { ascending: false })
    .order("semester", { ascending: false })
    .order("version", { ascending: false })
    .limit(1);
  if (any.error) throw explain(any.error);
  return ((any.data ?? [])[0] as PlanRow | undefined) ?? null;
}

export type SaveInput = {
  kind: PlanKind;
  scope: string;
  year: number;
  semester: number;
  exam: string;
  parsed: Record<string, unknown>;
  note: string;
  /** 새 파일을 올릴 때 */
  file?: File;
  /** 파일은 그대로 두고 값만 정정할 때: 정정 대상 판 */
  base?: PlanRow;
};

/** 새 판을 저장한다. 파일을 올렸으면 저장소에 먼저 올리고, 기록을 추가한다(기존 판은 그대로 남는다). */
export async function savePlan(input: SaveInput): Promise<PlanRow> {
  const supabase = createClient();
  let file_path: string;
  let file_name: string;
  let file_type: FileType;

  if (input.file) {
    const type = input.kind === "curriculum" ? (/\.hwp$/i.test(input.file.name) ? "hwp" : null) : fileTypeOf(input.file.name);
    if (!type) throw new Error(input.kind === "curriculum" ? "편제표는 hwp 파일만 올릴 수 있어요." : "hwpx, xlsx, pdf 파일만 올릴 수 있어요.");
    file_path = `${input.kind}/${crypto.randomUUID()}.${type}`;
    file_name = input.file.name;
    file_type = type;
    const up = await supabase.storage.from(BUCKET).upload(file_path, input.file, {
      contentType: input.file.type || "application/octet-stream",
      upsert: false,
    });
    if (up.error) throw explain(up.error);
  } else if (input.base) {
    ({ file_path, file_name, file_type } = input.base);
  } else {
    throw new Error("올릴 파일이 없어요.");
  }

  const key = { kind: input.kind, scope: input.scope, year: input.year, semester: input.semester, exam: input.exam };
  for (let attempt = 0; attempt < 3; attempt++) {
    const last = await supabase
      .from("plan_uploads")
      .select("version")
      .match(key)
      .order("version", { ascending: false })
      .limit(1);
    if (last.error) throw explain(last.error);
    const version = ((last.data ?? [])[0]?.version ?? 0) + 1;
    const ins = await supabase
      .from("plan_uploads")
      .insert({ ...key, version, file_path, file_name, file_type, parsed: input.parsed, note: input.note })
      .select(COLUMNS)
      .single();
    if (!ins.error) return ins.data as PlanRow;
    if (ins.error.code !== "23505") throw explain(ins.error); // 다른 사람이 같은 순간에 올렸으면 판 번호를 다시 계산한다
  }
  throw new Error("같은 시각에 다른 자료가 올라와 저장하지 못했어요. 다시 시도해 주세요.");
}

/** 내려받기용 임시 주소(1분 동안 유효). */
export async function signedUrl(path: string, downloadName?: string): Promise<string> {
  const { data, error } = await createClient().storage.from(BUCKET).createSignedUrl(path, 60, { download: downloadName ?? true });
  if (error || !data) throw explain(error ?? { message: "내려받을 주소를 만들지 못했어요." });
  return data.signedUrl;
}
