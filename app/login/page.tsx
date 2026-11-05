"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { describeAuthError } from "@/lib/authErrors";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const supabase = createClient();

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMessage(describeAuthError(error, "signin"));
    } else {
      router.replace("/");
      router.refresh();
    }
    setBusy(false);
  }

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-xl bg-white p-6 shadow-sm ring-1 ring-black/5"
      >
        <h1 className="text-xl font-bold">관리자 로그인</h1>
        <p className="text-sm text-gray-600">
          관리자 계정으로 로그인하세요. 분할점수 페이지는 로그인 없이 쓸 수 있어요.
        </p>
        <label className="block space-y-1">
          <span className="text-sm font-medium">이메일</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">비밀번호</span>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2"
          />
        </label>
        {message && <p className="rounded-md bg-amber-50 p-2 text-sm text-amber-900">{message}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-blue-600 py-2 font-semibold text-white disabled:opacity-50"
        >
          {busy ? "처리 중…" : "로그인"}
        </button>
        <Link href="/cutoff" className="block w-full text-center text-sm text-blue-700 underline">
          분할점수 페이지로
        </Link>
      </form>
    </main>
  );
}
