// 한글 5.x 이진 파일(.hwp)에서 문단 글자를 읽는다. hwp는 CFB(복합 문서) 안에 구역(BodyText/Section*)이 들어 있고,
// 각 구역은 (압축되어 있으면 deflate를 풀고. 브라우저의 DecompressionStream은 압축 뒤에 덧붙은 바이트가 있으면 실패해서 fflate를 쓴다) 4바이트 머리 + 내용으로 된 기록의 나열이다.
// 표의 칸은 문단으로 나오므로, 표 모양은 몰라도 칸 글자가 읽는 순서대로 한 줄씩 나온다.
import * as CFB from "cfb";
import { inflateSync } from "fflate";

const HWPTAG_PARA_TEXT = 0x43;
/** 글자 뒤에 14바이트(8바이트 코드 + 6바이트 덧붙임)가 따라오는 확장·인라인 제어 문자 */
const EXTENDED = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 14, 15, 16, 17, 18, 21, 22, 23]);

/** PARA_TEXT 기록 하나의 글자. 제어 문자는 건너뛰고 탭만 남긴다. */
function paragraphText(body: Uint8Array): string {
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  let text = "";
  for (let j = 0; j + 1 < body.length; ) {
    const c = view.getUint16(j, true);
    j += 2;
    if (c >= 32) {
      text += String.fromCharCode(c);
      continue;
    }
    if (EXTENDED.has(c)) j += 14;
    if (c === 9) text += "\t";
  }
  return text.replace(/\r/g, "");
}

/** 구역 하나의 기록들에서 문단 글자(앞뒤 공백 제거, 빈 문단 제외)를 모은다. */
function sectionTexts(data: Uint8Array): string[] {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const out: string[] = [];
  for (let i = 0; i + 4 <= data.length; ) {
    const header = view.getUint32(i, true);
    i += 4;
    const tag = header & 0x3ff;
    let size = header >>> 20;
    if (size === 0xfff) {
      size = view.getUint32(i, true);
      i += 4;
    }
    if (tag === HWPTAG_PARA_TEXT) {
      const t = paragraphText(data.subarray(i, i + size)).trim();
      if (t !== "") out.push(t);
    }
    i += size;
  }
  return out;
}

/** hwp 파일의 모든 구역에서 문단 글자를 읽는 순서대로 돌려준다. 암호가 걸렸거나 hwp가 아니면 오류. */
export async function readHwpTexts(bytes: ArrayBuffer | Uint8Array): Promise<string[]> {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let cfb: CFB.CFB$Container;
  try {
    cfb = CFB.read(buf, { type: "array" });
  } catch {
    throw new Error("한글(hwp) 파일로 읽지 못했어요.");
  }
  const headerContent = CFB.find(cfb, "/FileHeader")?.content as ArrayLike<number> | undefined;
  const header = headerContent ? new Uint8Array(headerContent) : undefined;
  if (!header || header.length < 40 || String.fromCharCode(...header.subarray(0, 17)) !== "HWP Document File") {
    throw new Error("한글(hwp) 파일로 읽지 못했어요.");
  }
  const flags = new DataView(header.buffer, header.byteOffset, header.byteLength).getUint32(36, true);
  if (flags & 2) throw new Error("암호가 걸린 hwp 파일은 읽을 수 없어요. NEIS에서 다시 받아 올려 주세요.");
  const compressed = (flags & 1) !== 0;

  const sections = cfb.FullPaths.map((path, i) => ({ path, entry: cfb.FileIndex[i] }))
    .filter(({ path }) => /\/BodyText\/Section\d+$/.test(path))
    .sort((a, b) => Number(/\d+$/.exec(a.path)![0]) - Number(/\d+$/.exec(b.path)![0]));
  const texts: string[] = [];
  for (const { entry } of sections) {
    const raw = new Uint8Array(entry.content as ArrayLike<number>);
    texts.push(...sectionTexts(compressed ? inflateSync(raw) : raw));
  }
  return texts;
}
