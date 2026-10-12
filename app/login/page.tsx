"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const supabase = createClient();

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setMessage("이메일 또는 비밀번호가 맞지 않거나, 아직 이메일 확인을 하지 않았어요.");
      } else {
        router.replace("/");
        router.refresh();
      }
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/login` },
      });
      if (error) {
        setMessage(`가입하지 못했어요: ${error.message}`);
      } else if (data.session) {
        router.replace("/");
        router.refresh();
      } else {
        setMessage("확인 메일을 보냈어요. 메일의 링크를 누른 뒤 로그인해 주세요.");
        setMode("signin");
      }
    }
    setBusy(false);
  }

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-xl bg-white p-6 shadow-sm ring-1 ring-black/5"
      >
        <h1 className="text-xl font-bold">자리 배치표</h1>
        <p className="text-sm text-gray-600">
          {mode === "signin" ? "선생님 계정으로 로그인하세요." : "새 선생님 계정을 만들어요."}
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
          <span className="text-sm font-medium">비밀번호 (8자 이상)</span>
          <input
            type="password"
            required
            minLength={8}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
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
          {busy ? "처리 중…" : mode === "signin" ? "로그인" : "가입하기"}
        </button>
        <button
          type="button"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setMessage(null);
          }}
          className="w-full text-sm text-blue-700 underline"
        >
          {mode === "signin" ? "처음이세요? 계정 만들기" : "이미 계정이 있어요. 로그인하기"}
        </button>
      </form>
    </main>
  );
}
