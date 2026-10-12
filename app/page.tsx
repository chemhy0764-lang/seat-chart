import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fitSeats, type Separation, type Student } from "@/lib/seating";
import SeatEditor, { type ChartData } from "@/components/SeatEditor";

export default function Home() {
  return (
    <Suspense fallback={<p className="p-6 text-gray-500">불러오는 중…</p>}>
      <Editor />
    </Suspense>
  );
}

async function Editor() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: row } = await supabase
    .from("seat_charts")
    .select("class_name, columns, rows, front_rows, students, seats, separations")
    .eq("owner_id", user.id)
    .maybeSingle();

  const columns = row?.columns ?? 3;
  const rows = row?.rows ?? 7;
  const students: Student[] = Array.isArray(row?.students) ? row.students : [];
  const initial: ChartData = {
    className: row?.class_name ?? "",
    columns,
    rows,
    frontRows: row?.front_rows ?? 2,
    students,
    seats: fitSeats(Array.isArray(row?.seats) ? row.seats : [], students, { columns, rows }, columns),
    separations: Array.isArray(row?.separations) ? (row.separations as Separation[]) : [],
  };

  return <SeatEditor initial={initial} userId={user.id} email={user.email ?? ""} />;
}
