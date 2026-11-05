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
