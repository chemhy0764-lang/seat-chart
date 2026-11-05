import type { Metadata } from "next";
import Link from "next/link";
import CutoffTool from "@/components/CutoffTool";

export const metadata: Metadata = {
  title: "분할점수",
  description: "분할점수 안내·공지 문서 만들기와 입력값 점검",
};

export default function CutoffPage() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">분할점수</h1>
        <Link href="/" className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm">
          자리 배치표로
        </Link>
      </header>
      <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
        분할점수 안내·공지 문서(한글 파일)를 만들고, NEIS에 입력하기 전에 값을 점검하는 페이지예요. NEIS의 산출 결과를 대신하지
        않으며, 입력한 값은 저장하지 않아요. 점검 도구의 학기말 계산값은 근사값이라 NEIS 출력과 1점 안팎으로 다를 수 있어요.
      </p>
      <CutoffTool />
    </div>
  );
}
