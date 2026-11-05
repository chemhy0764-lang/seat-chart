"use client";
import type { Templates } from "./docs";

const NAMES: Record<keyof Templates, string> = {
  guideFirst: "guide-1st",
  guideSecond: "guide-2nd",
  minutes: "minutes",
  noticeWritten: "notice-written",
  noticeTerm: "notice-term",
  noticePerf: "notice-perf",
};

/** 저장소에 들어 있는 한글(hwpx) 서식 파일을 가져온다. */
export async function loadTemplate(key: keyof Templates): Promise<Uint8Array> {
  const res = await fetch(`/hwpx/${NAMES[key]}.hwpx`);
  if (!res.ok) throw new Error(`서식 파일을 가져오지 못했어요(${res.status}). 로그인이 풀렸다면 다시 로그인하세요.`);
  return new Uint8Array(await res.arrayBuffer());
}

/** 만든 파일을 내려받게 한다. */
export function saveFile(bytes: Uint8Array, fileName: string): void {
  const blob = new Blob([bytes as BlobPart], { type: "application/hwp+zip" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** 파일 이름에 쓸 수 없는 글자를 뺀다. */
export const safeName = (s: string) => s.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();
