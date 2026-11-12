import * as CFB from "cfb";
import { deflateRawSync } from "node:zlib";

/** 시험용 hwp: 구역 하나에 문단 글자 기록만 넣은 CFB. */
export function fakeHwp(texts: string[], compressed: boolean): Uint8Array {
  const records = texts.map((t) => {
    const body = Buffer.alloc(t.length * 2 + 2);
    for (let i = 0; i < t.length; i++) body.writeUInt16LE(t.charCodeAt(i), i * 2);
    body.writeUInt16LE(13, t.length * 2);
    const head = Buffer.alloc(4);
    head.writeUInt32LE(0x43 | (3 << 10) | (body.length << 20), 0);
    return Buffer.concat([head, body]);
  });
  const section = Buffer.concat(records);
  const header = Buffer.alloc(256);
  header.write("HWP Document File", 0, "latin1");
  header.writeUInt32LE(compressed ? 1 : 0, 36);
  const cfb = CFB.utils.cfb_new();
  CFB.utils.cfb_add(cfb, "/FileHeader", header);
  CFB.utils.cfb_add(cfb, "/BodyText/Section0", compressed ? deflateRawSync(section) : section);
  return new Uint8Array(CFB.write(cfb, { type: "buffer" }) as Buffer);
}
