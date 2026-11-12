"use client";

import { useState } from "react";
import DropZone from "@/components/DropZone";
import type { Term } from "@/lib/hwpx/docs";
import { latestPlan, savePlan } from "@/lib/plans/api";
import { analyzeUpload, type Analysis } from "@/lib/plans/analyze";
import type { Course } from "@/lib/plans/curriculum";
import { tidySubjectNames } from "@/lib/plans/names";

const box = "space-y-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-black/5";

type Item = { name: string; state: "wait" | "work" | "saved" | "skipped"; text: string };

/**
 * 여러 파일을 한꺼번에 끌어다 놓으면 파일마다 어떤 자료인지 알아내(교과협의록, 추정분할점수, 편제표) 위에서 고른 학년도·학기로 저장한다.
 * 교과·학년을 알아낼 수 없거나, 학기가 다르거나, 이미 올린 자료가 있는 파일은 저장하지 않고 이유를 알려 준다(정정은 아래 구역에서).
 */
export default function BulkUpload({ term, onDone }: { term: Term; onDone: () => void }) {
  const { year, semester } = term;
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);

  async function run(files: File[]) {
    if (files.length === 0 || busy) return;
    setBusy(true);
    const list: Item[] = files.map((f) => ({ name: f.name, state: "wait", text: "기다리는 중" }));
    setItems(list);
    const update = (i: number, patch: Partial<Item>) => {
      list[i] = { ...list[i], ...patch };
      setItems([...list]);
    };
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      update(i, { state: "work", text: "읽는 중…" });
      try {
        const a: Analysis = await analyzeUpload(file.name, await file.arrayBuffer());
        if (!a.ok) {
          update(i, { state: "skipped", text: `저장하지 않았어요. ${a.reason}` });
          continue;
        }
        if ((a.year !== null && a.year !== year) || (a.semester !== null && a.semester !== semester)) {
          const fileTerm = `${a.year ? `${a.year}학년도 ` : ""}${a.semester ? `${a.semester}학기` : ""}`.trim();
          update(i, { state: "skipped", text: `${a.label}: 파일은 ${fileTerm} 자료로 보여요. 위에서 고른 ${year}학년도 ${semester}학기와 달라서 저장하지 않았어요. 학기를 맞춘 뒤 다시 올려 주세요.` });
          continue;
        }
        const previous = await latestPlan(a.kind, a.scope, year, semester);
        if (previous) {
          update(i, { state: "skipped", text: `${a.label}: 이미 올린 자료(${previous.version}판)가 있어서 저장하지 않았어요. 정정은 아래 구역에서 '이 판으로 정정'을 쓰세요.` });
          continue;
        }
        let parsed = a.parsed;
        if (a.kind === "cutoffs") {
          // PDF에서 벌어진 과목 이름의 띄어쓰기를 편제표(있으면)와 과목 목록의 표기로 바로잡는다.
          const curriculum = await latestPlan("curriculum", a.scope, year, semester);
          const known = ((curriculum?.parsed as { courses?: Course[] } | undefined)?.courses ?? []).map((c) => c.subject);
          const texts = a.parsed.texts as Record<string, string>;
          parsed = { texts: Object.fromEntries(Object.entries(texts).map(([k, v]) => [k, tidySubjectNames(v, known).trim()])) };
        }
        const saved = await savePlan({ kind: a.kind, scope: a.scope, year, semester, exam: "", parsed, note: "", file });
        update(i, { state: "saved", text: `${a.label} ${saved.version}판으로 저장했어요.` });
      } catch (e) {
        update(i, { state: "skipped", text: `저장하지 못했어요. ${e instanceof Error ? e.message : "알 수 없는 오류"}` });
      }
    }
    setBusy(false);
    onDone();
  }

  const saved = items.filter((x) => x.state === "saved").length;
  const skipped = items.filter((x) => x.state === "skipped").length;

  return (
    <section className={box}>
      <h2 className="font-semibold">여러 파일 한꺼번에 올리기 ({year}학년도 {semester}학기)</h2>
      <p className="text-sm text-gray-600">
        교과협의록, 추정분할점수(NEIS 엑셀·PDF), 편제표(hwp) 파일을 한꺼번에 끌어다 놓으면 파일마다 종류와 교과·학년을 알아내 저장해요. 알아낼 수 없는 파일, 학기가 다른 파일, 이미 올린
        자료가 있는 파일은 저장하지 않고 이유를 알려 줘요. 그런 파일은 아래 구역에서 하나씩 올리세요.
      </p>
      <DropZone file={null} accept=".hwp,.hwpx,.xlsx,.pdf" hint="여러 개 · hwp, hwpx, xlsx, pdf" onFiles={(files) => void run(files)} multiple />
      {items.length > 0 && (
        <div className="space-y-1 text-sm" aria-live="polite">
          <p className="font-semibold">
            {busy ? "저장하는 중…" : `완료: ${saved}개 저장, ${skipped}개는 저장하지 않았어요.`}
          </p>
          <ul className="space-y-1">
            {items.map((x, i) => (
              <li
                key={i}
                className={`rounded-md p-2 text-xs ${x.state === "saved" ? "bg-emerald-50 text-emerald-900" : x.state === "skipped" ? "bg-amber-50 text-amber-900" : "bg-gray-50 text-gray-700"}`}
              >
                <b>{x.name}</b> — {x.text}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
