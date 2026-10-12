"use client";

import { useDraggable, useDroppable } from "@dnd-kit/core";
import { SEATS_PER_GROUP, type Student } from "@/lib/seating";

// "board-top": PDF 1쪽처럼 전자칠판이 위 (학생 쪽에서 본 모습)
// "board-bottom": PDF 2쪽처럼 180° 돌린 모습 (교탁에서 본 모습)
export type View = "board-top" | "board-bottom";

type Props = {
  seats: (string | null)[];
  studentsById: Map<string, Student>;
  columns: number;
  rows: number;
  frontRows: number;
  view: View;
  interactive?: boolean;
  print?: boolean;
  conflicts?: Set<number>;
};

export default function SeatGrid({
  seats,
  studentsById,
  columns,
  rows,
  frontRows,
  view,
  interactive = false,
  print = false,
  conflicts,
}: Props) {
  const width = columns * SEATS_PER_GROUP;
  const flipped = view === "board-bottom";
  const rowOrder = [...Array(rows).keys()];
  const groupOrder = [...Array(columns).keys()];
  if (flipped) {
    rowOrder.reverse();
    groupOrder.reverse();
  }

  const board = (
    <div className="flex justify-center">
      <div
        className={`border-2 border-black bg-white text-center font-bold ${
          print ? "w-[60%] py-2 text-xl" : "w-3/5 py-2 text-lg"
        }`}
      >
        전자칠판
      </div>
    </div>
  );

  const rowLabels = (
    <div className="flex flex-col">
      {rowOrder.map((row) => (
        <div
          key={row}
          className={`flex items-center justify-center border border-black bg-white font-semibold ${
            print ? "h-[22mm] w-[8mm]" : "h-16 w-8"
          } ${row === rows - 1 && !flipped ? "border-2" : ""}`}
        >
          {row + 1}
        </div>
      ))}
    </div>
  );

  return (
    <div className={`flex flex-col ${print ? "gap-[8mm]" : "gap-6"}`}>
      {!flipped && board}
      <div className={`flex justify-center ${print ? "gap-[5mm]" : "gap-3"}`}>
        {!flipped && rowLabels}
        {groupOrder.map((group) => (
          <div key={group} className="flex flex-col">
            {rowOrder.map((row) => {
              const pair = [0, 1].map((k) => row * width + group * SEATS_PER_GROUP + k);
              if (flipped) pair.reverse();
              return (
                <div key={row} className="flex">
                  {pair.map((index) => (
                    <Seat
                      key={index}
                      index={index}
                      student={seats[index] ? studentsById.get(seats[index]!) : undefined}
                      interactive={interactive}
                      print={print}
                      front={row < frontRows}
                      thick={row === rows - 1 && !flipped}
                      conflict={interactive && !!conflicts?.has(index)}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        ))}
        {flipped && rowLabels}
      </div>
      {flipped && board}
    </div>
  );
}

function Seat({
  index,
  student,
  interactive,
  print,
  front,
  thick,
  conflict,
}: {
  index: number;
  student?: Student;
  interactive: boolean;
  print: boolean;
  front: boolean;
  thick: boolean;
  conflict: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `seat-${index}`, disabled: !interactive });

  return (
    <div
      ref={interactive ? setNodeRef : undefined}
      className={`-ml-px -mt-px flex items-center justify-center border border-black text-center ${
        print ? "h-[22mm] w-[26mm] text-[13pt]" : "h-16 w-20 text-sm sm:w-24 sm:text-base"
      } ${thick ? "border-2" : ""} ${
        isOver
          ? "bg-blue-100"
          : conflict
            ? "bg-red-100 text-red-800"
            : interactive && front
              ? "bg-amber-50"
              : "bg-white"
      }`}
    >
      {student &&
        (interactive ? (
          <StudentChip student={student} />
        ) : (
          <span className="px-1 font-medium">{student.name}</span>
        ))}
    </div>
  );
}

export function StudentChip({ student }: { student: Student }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `student-${student.id}`,
  });

  return (
    <button
      type="button"
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined}
      className={`relative cursor-grab touch-none rounded px-1.5 py-1 font-medium select-none ${
        isDragging ? "z-10 bg-blue-600 text-white shadow-lg" : "hover:bg-gray-100"
      }`}
    >
      {student.name}
      {student.front && <span className="ml-0.5 text-xs text-amber-600">★</span>}
    </button>
  );
}
