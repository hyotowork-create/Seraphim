import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'FaithOps AI Studio · 본문기반 예배 콘텐츠 자동화',
  description:
    '성경본문 하나를 입력하면 설교문, 주보, PPT, 유튜브 콘텐츠, Slack 보고까지 한 번에 생성하는 AI 예배 콘텐츠 운영 스튜디오',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>
        <header className="sticky top-0 z-10 border-b border-border bg-white/80 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <Link href="/" className="flex items-center gap-2 font-bold">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">
                ✝
              </span>
              <span>
                FaithOps <span className="text-primary">AI Studio</span>
              </span>
            </Link>
            <nav className="flex items-center gap-1 text-sm">
              <Link href="/create" className="rounded-md px-3 py-1.5 hover:bg-muted">
                본문 입력
              </Link>
              <Link href="/projects" className="rounded-md px-3 py-1.5 hover:bg-muted">
                보관함
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
        <footer className="mx-auto max-w-5xl px-4 py-8 text-center text-xs text-muted-foreground">
          FaithOps AI Studio · 모든 산출물은 AI 초안이며 사람의 검수가 필요합니다.
        </footer>
      </body>
    </html>
  );
}
