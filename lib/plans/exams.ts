import type { NoticeKind } from "../hwpx/docs";

/** 추정분할점수 자료의 시험 구분(저장하는 값)과 공지 화면의 문서 종류 */
export const EXAMS: { value: string; label: string; kind: NoticeKind }[] = [
  { value: "1차", label: "1차 정기시험", kind: "first" },
  { value: "수행", label: "수행평가", kind: "perf" },
  { value: "2차", label: "2차 정기시험·학기말", kind: "term" },
];

export const examValueFor = (kind: NoticeKind): string => EXAMS.find((e) => e.kind === kind)!.value;
