"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ROLES, ROLE_LABELS, type Role } from "@/lib/enums";

interface Row {
  id: string;
  email: string;
  name: string;
  role: string;
  active: boolean;
}

export function UserManager({ initial }: { initial: Row[] }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("STAFF");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, name, password, role }),
    });
    setBusy(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setMsg(b.message ?? "생성 실패");
      return;
    }
    setEmail("");
    setName("");
    setPassword("");
    setRole("STAFF");
    setMsg("사용자를 생성했습니다");
    router.refresh();
  }

  return (
    <section className="space-y-4">
      <form onSubmit={create} className="grid gap-2 rounded-lg border bg-white p-4 sm:grid-cols-2">
        <input
          className="rounded border px-3 py-2"
          placeholder="이메일"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className="rounded border px-3 py-2"
          placeholder="이름"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <input
          className="rounded border px-3 py-2"
          placeholder="비밀번호(8자 이상)"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <select
          className="rounded border px-3 py-2"
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]} ({r})
            </option>
          ))}
        </select>
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={busy}
            className="rounded bg-indigo-600 px-4 py-2 text-white disabled:opacity-50"
          >
            사용자 생성
          </button>
          {msg && <span className="ml-3 text-sm text-slate-600">{msg}</span>}
        </div>
      </form>

      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="px-3 py-2">이름</th>
              <th className="px-3 py-2">이메일</th>
              <th className="px-3 py-2">역할</th>
              <th className="px-3 py-2">상태</th>
            </tr>
          </thead>
          <tbody>
            {initial.map((u) => (
              <tr key={u.id} className="border-t">
                <td className="px-3 py-2">{u.name}</td>
                <td className="px-3 py-2 text-slate-500">{u.email}</td>
                <td className="px-3 py-2">{ROLE_LABELS[u.role as Role] ?? u.role}</td>
                <td className="px-3 py-2">
                  {u.active ? (
                    <span className="text-green-600">활성</span>
                  ) : (
                    <span className="text-slate-400">비활성</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
