"use client";

import { useRef, useState } from "react";

const kb = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))}KB` : `${(bytes / 1024 / 1024).toFixed(1)}MB`);

/**
 * 파일을 끌어다 놓거나, 영역을 눌러(키보드는 Enter·Space) 파일 선택 창으로 고른다.
 * 어떤 파일이 들어왔는지(종류, 개수)는 받는 쪽(onFiles)이 판단한다.
 */
export default function DropZone({
  file,
  accept,
  hint,
  onFiles,
  multiple = false,
}: {
  file: File | null;
  accept: string;
  hint: string;
  onFiles: (files: File[]) => void;
  /** 파일 선택 창에서도 여러 파일을 고를 수 있게 한다(끌어다 놓기는 항상 여러 개를 받는다) */
  multiple?: boolean;
}) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const open = () => input.current?.click();

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="파일 올리기: 파일을 끌어다 놓거나 눌러서 선택"
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
      onDragEnter={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        onFiles(Array.from(e.dataTransfer.files));
      }}
      className={`w-full cursor-pointer rounded-md border-2 border-dashed p-4 text-center text-sm transition-colors ${
        over ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-300 bg-white text-gray-600 hover:border-gray-400"
      }`}
    >
      <input
        ref={input}
        type="file"
        multiple={multiple}
        accept={accept}
        className="sr-only"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []));
          e.target.value = ""; // 같은 파일을 다시 골라도 반응하도록
        }}
      />
      {over ? (
        <span className="font-semibold">여기에 놓으세요</span>
      ) : file ? (
        <span>
          선택한 파일: <b>{file.name}</b> ({kb(file.size)}) <span className="text-gray-500">· 다른 파일을 끌어다 놓거나 눌러서 바꿀 수 있어요</span>
        </span>
      ) : (
        <span>
          파일을 여기로 <b>끌어다 놓거나</b> 눌러서 선택하세요 <span className="text-gray-500">({hint})</span>
        </span>
      )}
    </div>
  );
}
