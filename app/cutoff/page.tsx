import type { Metadata } from "next";
import CutoffTool from "@/components/CutoffTool";

export const metadata: Metadata = {
  title: "분할점수",
  description: "분할점수 안내·공지 문서 만들기와 입력값 점검",
};

export default function CutoffPage() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 p-4">
      <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
        분할점수 안내·공지 문서(한글 파일)를 만드는 페이지예요. NEIS의 산출 결과를 대신하지 않으며, 입력한 값은 저장하지 않아요.
      </p>
      <CutoffTool />
    </div>
  );
}
