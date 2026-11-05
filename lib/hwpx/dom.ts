// hwpx(한글) 문서의 XML을 다루는 작은 도구. 브라우저의 DOMParser와 Node(테스트용 @xmldom/xmldom)에서 모두 동작한다.

const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>';

export function parseXml(xml: string): Document {
  return new DOMParser().parseFromString(xml, "application/xml");
}

export function serializeXml(doc: Document): string {
  return XML_DECL + new XMLSerializer().serializeToString(doc.documentElement);
}

/** 직계 자식 요소. name을 주면 localName이 같은 것만. */
export function children(el: Element, name?: string): Element[] {
  const out: Element[] = [];
  for (let n = el.firstChild; n; n = n.nextSibling) {
    if (n.nodeType === 1 && (!name || (n as Element).localName === name)) out.push(n as Element);
  }
  return out;
}

/** 모든 후손 요소(문서 순서). */
export function descendants(el: Element | Document, name: string): Element[] {
  const list = el.getElementsByTagNameNS("*", name);
  const out: Element[] = [];
  for (let i = 0; i < list.length; i++) out.push(list[i] as Element);
  return out;
}

export function first(el: Element, name: string): Element | undefined {
  return children(el, name)[0];
}

export function removeAll(els: Element[]): void {
  for (const e of els) e.parentNode?.removeChild(e);
}

/** 한글이 열 때 줄 배치를 다시 계산하도록, 글자를 바꾼 문서의 줄 배치 캐시(linesegarray)를 모두 지운다. */
export function stripLineSegs(doc: Document): void {
  removeAll(descendants(doc, "linesegarray"));
}
