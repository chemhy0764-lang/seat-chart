import { children, descendants, first, removeAll } from "./dom.ts";

const TEXT_NODE = 3;

/** 문단(hp:p)에 직접 속한 글자 조각(hp:run > hp:t 안의 텍스트 노드). 표 안의 문단은 제외한다. */
function textNodes(p: Element): Text[] {
  const out: Text[] = [];
  for (const run of children(p, "run")) {
    for (const t of children(run, "t")) {
      for (let n = t.firstChild; n; n = n.nextSibling) if (n.nodeType === TEXT_NODE) out.push(n as Text);
    }
  }
  return out;
}

/** 한 문단 안에서 from을 to로 바꾼다. 글자가 여러 조각(run)으로 나뉘어 있어도 찾아서, 첫 조각의 서식으로 합친다. */
export function replaceInParagraph(p: Element, from: string, to: string): number {
  let count = 0;
  let searchFrom = 0;
  for (;;) {
    const nodes = textNodes(p);
    const full = nodes.map((n) => n.data).join("");
    const at = full.indexOf(from, searchFrom);
    if (at < 0) return count;
    const end = at + from.length;
    let offset = 0;
    let placed = false;
    for (const node of nodes) {
      const len = node.data.length;
      const start = offset;
      const stop = offset + len;
      offset = stop;
      if (stop <= at || start >= end) continue;
      const cutFrom = Math.max(at, start) - start;
      const cutTo = Math.min(end, stop) - start;
      node.data = node.data.slice(0, cutFrom) + (placed ? "" : to) + node.data.slice(cutTo);
      placed = true;
    }
    count++;
    searchFrom = at + to.length;
  }
}

/** 문서 전체의 모든 문단에서 차례로 치환한다. 치환한 횟수를 돌려준다. */
export function replaceAll(doc: Document, pairs: [string, string][]): number {
  const paragraphs = descendants(doc, "p");
  let total = 0;
  for (const [from, to] of pairs) {
    if (from === to) continue;
    for (const p of paragraphs) total += replaceInParagraph(p, from, to);
  }
  return total;
}

/** 문단의 글자를 text로 통째로 바꾼다(서식은 첫 run을 따른다). */
export function setParagraphText(p: Element, text: string): void {
  const runs = children(p, "run");
  for (const run of runs) removeAll(children(run, "t"));
  const target = runs.find((r) => children(r).every((c) => c.localName === "t")) ?? runs[0];
  if (!target) return;
  if (text !== "") {
    const t = target.ownerDocument.createElementNS(target.namespaceURI, `${target.prefix}:t`);
    t.appendChild(target.ownerDocument.createTextNode(text));
    target.appendChild(t);
  }
  removeAll(children(p, "linesegarray"));
}

/** 표 칸(hp:tc)의 글자를 줄 단위로 바꾼다. 문단 수가 다르면 마지막 문단을 복제하거나 남는 문단을 지운다. */
export function setCellText(tc: Element, lines: string[]): void {
  const subList = first(tc, "subList");
  if (!subList) return;
  let paras = children(subList, "p");
  if (paras.length === 0) return;
  while (paras.length < lines.length) {
    const copy = paras[paras.length - 1].cloneNode(true) as Element;
    subList.appendChild(copy);
    paras = children(subList, "p");
  }
  while (paras.length > Math.max(1, lines.length)) {
    subList.removeChild(paras[paras.length - 1]);
    paras = children(subList, "p");
  }
  paras.forEach((p, i) => setParagraphText(p, lines[i] ?? ""));
}

/** 문단 전체 글자(표 안 제외). */
export function paragraphText(p: Element): string {
  return textNodes(p)
    .map((n) => n.data)
    .join("");
}
