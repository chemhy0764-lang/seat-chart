import JSZip from "jszip";
import { parseXml, serializeXml, stripLineSegs } from "./dom.ts";

export type Pkg = { zip: JSZip; section: Document };

const SECTION = "Contents/section0.xml";

export async function openPackage(data: ArrayBuffer | Uint8Array): Promise<Pkg> {
  const zip = await JSZip.loadAsync(data);
  const xml = await zip.file(SECTION)?.async("string");
  if (!xml) throw new Error("hwpx 파일에 본문(section0.xml)이 없어요.");
  return { zip, section: parseXml(xml) };
}

/** 본문을 다시 넣어 hwpx 바이트로 만든다. mimetype은 맨 앞에 압축 없이 둔다. */
export async function savePackage(pkg: Pkg): Promise<Uint8Array> {
  stripLineSegs(pkg.section);
  pkg.zip.file(SECTION, serializeXml(pkg.section), { createFolders: false });
  pkg.zip.file("mimetype", "application/hwp+zip", { compression: "STORE", createFolders: false });
  return pkg.zip.generateAsync({ type: "uint8array", compression: "DEFLATE", mimeType: "application/hwp+zip" });
}

const HEADER = "Contents/header.xml";

/** 빨간색 계열(#C00000 이상의 붉은 기운, 초록·파랑이 낮은 색)인지. */
function isRed(hex: string): boolean {
  const h = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return false;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return r >= 0xc0 && g <= 0x60 && b <= 0x60;
}

/**
 * 문서의 빨간 글자를 모두 검은색으로 바꾼다. 글자 서식(header.xml)의 글자색만 바꾸고, 표 테두리나 바탕색 같은 다른 색은 그대로 둔다.
 * 서식 파일에서 입력하는 값(날짜, 장소 등)이 빨갛게 표시되어 있어도 완성된 문서에는 검게 나오게 한다.
 */
export async function blackenRedText(pkg: Pkg): Promise<number> {
  const xml = await pkg.zip.file(HEADER)?.async("string");
  if (!xml) return 0;
  let changed = 0;
  const out = xml.replace(/textColor="(#[0-9a-fA-F]{6})"/g, (match, hex: string) => {
    if (!isRed(hex)) return match;
    changed++;
    return 'textColor="#000000"';
  });
  if (changed > 0) pkg.zip.file(HEADER, out, { createFolders: false });
  return changed;
}

