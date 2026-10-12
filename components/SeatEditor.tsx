"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { createClient } from "@/lib/supabase/client";
import {
  fitSeats,
  fitSeparations,
  parseRoster,
  seatCount,
  separationConflicts,
  shuffleSeats,
  unseated,
  type Separation,
  type Student,
  SEPARATION_WARNING,
} from "@/lib/seating";
import SeatGrid, { StudentChip, type View } from "./SeatGrid";

export type ChartData = {
  className: string;
  columns: number;
  rows: number;
  frontRows: number;
  students: Student[];
  seats: (string | null)[];
  separations: Separation[];
};

const HIDDEN_WARNING = "설정 조건을 모두 지키는 배치를 찾지 못했어요. 설정을 열어 확인해 주세요.";

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? Math.round(value) : min));

export default function SeatEditor({
  initial,
  userId,
  email,
}: {
  initial: ChartData;
  userId: string;
  email: string;
}) {
  const [chart, setChart] = useState<ChartData>(initial);
  const [rosterText, setRosterText] = useState(initial.students.map((s) => s.name).join("\n"));
  const [view, setView] = useState<View>("board-top");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [status, setStatus] = useState<"saved" | "dirty" | "saving" | "error">("saved");
  // 떨어져 앉을 학생은 학생들에게 비밀이다. 화면을 띄워 둘 수 있으니 기본은 닫아 둔다.
  const [showSecret, setShowSecret] = useState(false);

  const studentsById = useMemo(
    () => new Map(chart.students.map((s) => [s.id, s])),
    [chart.students],
  );
  const waiting = unseated(chart.students, chart.seats);
  const conflicts = useMemo(
    () => separationConflicts(chart.seats, chart.separations, chart.columns),
    [chart.seats, chart.separations, chart.columns],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor),
  );

  function update(next: Partial<ChartData>) {
    setChart((prev) => ({ ...prev, ...next }));
    setStatus("dirty");
  }

  function changeLayout(next: Partial<Pick<ChartData, "columns" | "rows" | "frontRows">>) {
    const columns = clamp(next.columns ?? chart.columns, 1, 6);
    const rows = clamp(next.rows ?? chart.rows, 1, 12);
    const frontRows = clamp(next.frontRows ?? chart.frontRows, 1, rows);
    update({
      columns,
      rows,
      frontRows,
      seats: fitSeats(chart.seats, chart.students, { columns, rows }, chart.columns),
    });
  }

  function applyRoster() {
    const students = parseRoster(rosterText, chart.students);
    update({
      students,
      seats: fitSeats(chart.seats, students, chart, chart.columns),
      separations: chart.separations
        .map((g) => g.filter((id) => students.some((s) => s.id === id)))
        .filter((g) => g.length > 0),
    });
    setRosterText(students.map((s) => s.name).join("\n"));
    setWarnings([]);
  }

  function toggleFront(id: string) {
    update({
      students: chart.students.map((s) => (s.id === id ? { ...s, front: !s.front } : s)),
    });
  }

  function shuffle() {
    const result = shuffleSeats(chart.students, chart, chart.separations);
    update({ seats: result.seats });
    setWarnings(result.warnings);
  }

  function clearSeats() {
    update({ seats: Array(seatCount(chart)).fill(null) });
    setWarnings([]);
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over) return;
    const studentId = String(active.id).replace("student-", "");
    const seats = [...chart.seats];
    const from = seats.indexOf(studentId);

    if (over.id === "waiting") {
      if (from >= 0) seats[from] = null;
    } else {
      const to = Number(String(over.id).replace("seat-", ""));
      if (to === from) return;
      const occupant = seats[to];
      seats[to] = studentId;
      if (from >= 0) seats[from] = occupant;
    }
    update({ seats });
  }

  async function save() {
    setStatus("saving");
    const supabase = createClient();
    const { error } = await supabase.from("seat_charts").upsert(
      {
        owner_id: userId,
        class_name: chart.className,
        columns: chart.columns,
        rows: chart.rows,
        front_rows: chart.frontRows,
        students: chart.students,
        seats: chart.seats,
        separations: fitSeparations(chart.separations, chart.students),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "owner_id" },
    );
    setStatus(error ? "error" : "saved");
  }

  const statusText = {
    saved: "저장됨",
    dirty: "저장하지 않은 변경이 있어요",
    saving: "저장 중…",
    error: "저장하지 못했어요. 다시 눌러 주세요.",
  }[status];

  const title = chart.className.trim() || "자리 배치표";

  return (
    <>
      <div className="no-print mx-auto w-full max-w-7xl space-y-4 p-4">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold">자리 배치표</h1>
          <div className="flex items-center gap-3 text-sm text-gray-600">
            <span>{email}</span>
            <form action="/auth/signout" method="post">
              <button className="rounded-md border border-gray-300 bg-white px-3 py-1.5">
                로그아웃
              </button>
            </form>
          </div>
        </header>

        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
            <aside className="space-y-4">
              <section className="space-y-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-black/5">
                <h2 className="font-semibold">교실 설정</h2>
                <label className="block space-y-1">
                  <span className="text-sm">학급 이름</span>
                  <input
                    value={chart.className}
                    maxLength={50}
                    placeholder="예: 2026-2학기 물질과 에너지"
                    onChange={(e) => update({ className: e.target.value })}
                    className="w-full rounded-md border border-gray-300 px-2 py-1.5"
                  />
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <NumberField
                    label="분단"
                    value={chart.columns}
                    min={1}
                    max={6}
                    onChange={(v) => changeLayout({ columns: v })}
                  />
                  <NumberField
                    label="줄"
                    value={chart.rows}
                    min={1}
                    max={12}
                    onChange={(v) => changeLayout({ rows: v })}
                  />
                  <NumberField
                    label="앞줄 범위"
                    value={chart.frontRows}
                    min={1}
                    max={chart.rows}
                    onChange={(v) => changeLayout({ frontRows: v })}
                  />
                </div>
                <p className="text-xs text-gray-500">
                  분단마다 2자리 · 모두 {seatCount(chart)}자리 · 학생 {chart.students.length}명
                </p>
              </section>

              <section className="space-y-2 rounded-xl bg-white p-4 shadow-sm ring-1 ring-black/5">
                <h2 className="font-semibold">학생 명단</h2>
                <p className="text-xs text-gray-500">한 줄에 한 명씩 붙여넣고 [명단 적용]을 누르세요.</p>
                <textarea
                  value={rosterText}
                  onChange={(e) => setRosterText(e.target.value)}
                  rows={6}
                  className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                />
                <button
                  onClick={applyRoster}
                  className="w-full rounded-md bg-gray-800 py-1.5 text-sm font-semibold text-white"
                >
                  명단 적용
                </button>
                {chart.students.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs text-gray-500">
                      ★ 앞줄 우선: 체크한 학생은 앞 {chart.frontRows}줄에 앉혀요.
                    </p>
                    <ul className="grid max-h-56 grid-cols-2 gap-x-2 overflow-y-auto text-sm">
                      {chart.students.map((s) => (
                        <li key={s.id}>
                          <label className="flex items-center gap-1.5 py-0.5">
                            <input
                              type="checkbox"
                              checked={s.front}
                              onChange={() => toggleFront(s.id)}
                            />
                            <span className="truncate">{s.name}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>

              {showSecret ? (
                <SeparationPanel
                  students={chart.students}
                  studentsById={studentsById}
                  separations={chart.separations}
                  onChange={(separations) => update({ separations })}
                  onHide={() => setShowSecret(false)}
                />
              ) : (
                <button
                  onClick={() => setShowSecret(true)}
                  className="flex w-full items-center justify-between rounded-xl bg-white p-4 text-left shadow-sm ring-1 ring-black/5"
                >
                  <span className="font-semibold">설정</span>
                  <span className="text-xs text-gray-500">
                    {conflicts.size > 0 && <span className="mr-2 text-red-600">확인 필요</span>}
                    열기
                  </span>
                </button>
              )}

              <WaitingArea students={waiting} />
            </aside>

            <section className="space-y-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-black/5">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={shuffle}
                  disabled={chart.students.length === 0}
                  className="rounded-md bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-40"
                >
                  무작위 섞기
                </button>
                <button
                  onClick={save}
                  disabled={status === "saving"}
                  className="rounded-md bg-emerald-600 px-4 py-2 font-semibold text-white disabled:opacity-40"
                >
                  저장
                </button>
                <button
                  onClick={() => window.print()}
                  className="rounded-md border border-gray-300 px-4 py-2 font-semibold"
                >
                  인쇄
                </button>
                <button
                  onClick={clearSeats}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700"
                >
                  자리 비우기
                </button>
                <span
                  className={`text-sm ${status === "error" ? "text-red-600" : status === "dirty" ? "text-amber-700" : "text-gray-500"}`}
                >
                  {statusText}
                </span>
                <div className="ml-auto flex overflow-hidden rounded-md border border-gray-300 text-sm">
                  {(
                    [
                      ["board-top", "칠판이 위"],
                      ["board-bottom", "칠판이 아래"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      onClick={() => setView(value)}
                      className={`px-3 py-1.5 ${view === value ? "bg-gray-800 text-white" : "bg-white"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {warnings.map((w) => (showSecret ? w : w.replace(SEPARATION_WARNING, HIDDEN_WARNING))).map((w) => (
                <p key={w} className="rounded-md bg-amber-50 p-2 text-sm text-amber-900">
                  {w}
                </p>
              ))}

              <p className="text-xs text-gray-500">
                이름을 끌어서 다른 자리에 놓으면 두 학생 자리가 바뀌어요. 노란 칸은 앞줄 우선 범위예요.
              </p>
              {showSecret && conflicts.size > 0 && (
                <p className="rounded-md bg-red-50 p-2 text-sm text-red-800">
                  빨간 칸: 떨어져 앉아야 할 학생끼리 붙어 있어요. 끌어서 옮기거나 다시 섞어 주세요.
                </p>
              )}

              <div className="overflow-x-auto py-2">
                <div className="min-w-fit px-2">
                  <SeatGrid
                    seats={chart.seats}
                    studentsById={studentsById}
                    columns={chart.columns}
                    rows={chart.rows}
                    frontRows={chart.frontRows}
                    view={view}
                    interactive
                    conflicts={showSecret ? conflicts : undefined}
                  />
                </div>
              </div>
            </section>
          </div>
        </DndContext>
      </div>

      <div className="print-only">
        {(["board-top", "board-bottom"] as const).map((v) => (
          <div key={v} className="print-page">
            <h1 className="mb-[6mm] text-center text-lg font-bold">{title}</h1>
            <SeatGrid
              seats={chart.seats}
              studentsById={studentsById}
              columns={chart.columns}
              rows={chart.rows}
              frontRows={chart.frontRows}
              view={v}
              print
            />
          </div>
        ))}
      </div>
    </>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-md border border-gray-300 px-2 py-1.5"
      />
    </label>
  );
}

function WaitingArea({ students }: { students: Student[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: "waiting" });
  return (
    <section
      ref={setNodeRef}
      className={`space-y-2 rounded-xl p-4 shadow-sm ring-1 ring-black/5 ${isOver ? "bg-blue-50" : "bg-white"}`}
    >
      <h2 className="font-semibold">자리 없는 학생 ({students.length})</h2>
      <p className="text-xs text-gray-500">
        여기 있는 이름을 빈자리로 끌어 놓으세요. 자리에서 빼려면 여기로 끌어 오세요.
      </p>
      <div className="flex min-h-10 flex-wrap gap-1 text-sm">
        {students.map((s) => (
          <div key={s.id} className="rounded border border-gray-300 bg-white">
            <StudentChip student={s} />
          </div>
        ))}
      </div>
    </section>
  );
}

function SeparationPanel({
  students,
  studentsById,
  separations,
  onChange,
  onHide,
}: {
  students: Student[];
  studentsById: Map<string, Student>;
  separations: Separation[];
  onChange: (separations: Separation[]) => void;
  onHide: () => void;
}) {
  const setGroup = (index: number, group: Separation | null) =>
    onChange(
      group === null
        ? separations.filter((_, i) => i !== index)
        : separations.map((g, i) => (i === index ? group : g)),
    );

  return (
    <section className="space-y-2 rounded-xl bg-white p-4 shadow-sm ring-1 ring-black/5">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">🔓 떨어져 앉을 학생</h2>
        <button
          onClick={onHide}
          className="rounded-md bg-gray-800 px-3 py-1 text-xs font-semibold text-white"
        >
          숨기기
        </button>
      </div>
      <p className="text-xs text-red-700">학생들이 보는 화면에서는 [숨기기]를 눌러 주세요.</p>
      <p className="text-xs text-gray-500">
        같은 묶음 학생끼리는 짝이 되지 않고, 앞뒤·옆·대각선으로도 붙어 앉지 않아요.
      </p>
      {separations.map((group, index) => (
        <div key={index} className="space-y-1.5 rounded-lg border border-gray-200 p-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">묶음 {index + 1}</span>
            <button
              onClick={() => setGroup(index, null)}
              className="text-xs text-gray-500 underline"
            >
              묶음 삭제
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            {group.map((id) => (
              <span
                key={id}
                className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-sm text-red-900"
              >
                {studentsById.get(id)?.name ?? "?"}
                <button
                  aria-label={`${studentsById.get(id)?.name ?? ""} 빼기`}
                  onClick={() => setGroup(index, group.filter((g) => g !== id))}
                  className="text-red-400 hover:text-red-700"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <select
            value=""
            onChange={(e) => e.target.value && setGroup(index, [...group, e.target.value])}
            className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
          >
            <option value="">+ 학생 추가…</option>
            {students
              .filter((s) => !group.includes(s.id))
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
          {group.length < 2 && <p className="text-xs text-amber-700">2명 이상 넣어야 적용돼요.</p>}
        </div>
      ))}
      <button
        onClick={() => onChange([...separations, []])}
        disabled={students.length < 2}
        className="w-full rounded-md border border-dashed border-gray-400 py-1.5 text-sm disabled:opacity-40"
      >
        + 묶음 추가
      </button>
    </section>
  );
}
