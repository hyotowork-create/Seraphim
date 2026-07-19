"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FUND_SOURCES, type FundSource } from "@/lib/enums";

interface Row {
  id: string;
  code: string;
  name: string;
  fiscalYear: number;
  fundSource: string;
  annualLimit: number;
  active: boolean;
}

const FUND_LABELS: Record<FundSource, string> = {
  GENERAL: "자체",
  SUBSIDY: "보조금",
  DESIGNATED: "지정기부",
};

export function BudgetManager({ initial }: { initial: Row[] }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear());
  const [fundSource, setFundSource] = useState<FundSource>("GENERAL");
  const [annualLimit, setAnnualLimit] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/budget-codes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code,
        name,
        fiscalYear: Number(fiscalYear),
        fundSource,
        annualLimit: Number(annualLimit),
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setMsg(b.message ?? "생성 실패");
      return;
    }
    setCode("");
    setName("");
    setAnnualLimit("");
    setMsg("예산코드를 생성했습니다");
    router.refresh();
  }

  return (
    <section className="space-y-4">
      <form onSubmit={create} className="grid gap-2 rounded-lg border bg-white p-4 sm:grid-cols-2">
        <input
          className="rounded border px-3 py-2"
          placeholder="코드 (예: 2026-사업-01)"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
        />
        <input
          className="rounded border px-3 py-2"
          placeholder="사업명"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <input
          className="rounded border px-3 py-2"
          type="number"
          placeholder="회계연도"
          value={fiscalYear}
          onChange={(e) => setFiscalYear(Number(e.target.value))}
          required
        />
        <select
          className="rounded border px-3 py-2"
          value={fundSource}
          onChange={(e) => setFundSource(e.target.value as FundSource)}
        >
          {FUND_SOURCES.map((f) => (
            <option key={f} value={f}>
              {FUND_LABELS[f]} ({f})
            </option>
          ))}
        </select>
        <input
          className="rounded border px-3 py-2 sm:col-span-2"
          type="number"
          placeholder="연간 한도(원)"
          value={annualLimit}
          onChange={(e) => setAnnualLimit(e.target.value)}
          required
        />
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={busy}
            className="rounded bg-indigo-600 px-4 py-2 text-white disabled:opacity-50"
          >
            예산코드 생성
          </button>
          {msg && <span className="ml-3 text-sm text-slate-600">{msg}</span>}
        </div>
      </form>

      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="px-3 py-2">코드</th>
              <th className="px-3 py-2">사업명</th>
              <th className="px-3 py-2">재원</th>
              <th className="px-3 py-2">연간한도</th>
            </tr>
          </thead>
          <tbody>
            {initial.map((b) => (
              <tr key={b.id} className="border-t">
                <td className="px-3 py-2 font-mono text-xs">{b.code}</td>
                <td className="px-3 py-2">{b.name}</td>
                <td className="px-3 py-2">{FUND_LABELS[b.fundSource as FundSource] ?? b.fundSource}</td>
                <td className="px-3 py-2">{b.annualLimit.toLocaleString("ko-KR")}원</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
