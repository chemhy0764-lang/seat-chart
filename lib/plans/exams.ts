import type { NoticeKind } from "../hwpx/docs";

/** 추정분할점수 자료에 들어 있는 시험별 표의 이름(공지 화면의 문서 종류와 같은 키) */
export const EXAM_LABELS: Record<NoticeKind, string> = {
  first: "1차 정기시험",
  perf: "수행평가",
  term: "2차 정기시험·학기말",
};

export const EXAM_KINDS: NoticeKind[] = ["first", "perf", "term"];
