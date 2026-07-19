import Link from "next/link";
import { ROLE_LABELS, type Role } from "@/lib/enums";
import { can, type Actor } from "@/lib/roles";

const LINKS: { href: string; label: string; cap?: Parameters<typeof can>[1] }[] = [
  { href: "/dashboard", label: "대시보드", cap: "dashboard:view" },
  { href: "/budgets", label: "예산관리", cap: "budget:manage" },
  { href: "/settings", label: "설정·사용자", cap: "users:manage" },
  { href: "/audit", label: "감사로그", cap: "audit:read" },
];

export function Nav({ actor, name }: { actor: Actor; name: string }) {
  return (
    <header className="border-b bg-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <span className="font-bold text-indigo-700">KSA-FLOW</span>
        <nav className="flex flex-wrap gap-3 text-sm">
          {LINKS.filter((l) => !l.cap || can(actor, l.cap)).map((l) => (
            <Link key={l.href} href={l.href} className="text-slate-600 hover:text-indigo-700">
              {l.label}
            </Link>
          ))}
        </nav>
        <span className="ml-auto text-sm text-slate-500">
          {name} · {ROLE_LABELS[actor.role as Role]}
        </span>
      </div>
    </header>
  );
}
