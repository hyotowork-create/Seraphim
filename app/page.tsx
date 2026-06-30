import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ALL_OUTPUT_TYPES, OUTPUT_META } from '@/lib/types';

export default function HomePage() {
  return (
    <div className="space-y-12">
      <section className="text-center">
        <p className="mb-3 inline-flex rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
          본문기반 예배 콘텐츠 자동화 스튜디오
        </p>
        <h1 className="mx-auto max-w-2xl text-3xl font-bold leading-tight sm:text-4xl">
          성경본문만 입력하세요.
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
          AI가 설교문, 주보, PPT, 유튜브 콘텐츠, 아동부 퀴즈, Slack 보고까지
          한 번에 준비합니다.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/create">
            <Button size="lg">이번 주 예배자료 생성하기</Button>
          </Link>
          <Link href="/projects">
            <Button size="lg" variant="outline">
              보관함 보기
            </Button>
          </Link>
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-center text-lg font-semibold">
          하나의 본문에서 생성되는 산출물
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ALL_OUTPUT_TYPES.map((type) => (
            <Card key={type}>
              <CardContent className="pt-5">
                <p className="font-semibold">{OUTPUT_META[type].label}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {OUTPUT_META[type].description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <Card>
          <CardContent className="pt-5">
            <h2 className="mb-3 font-semibold">생성 흐름</h2>
            <ol className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {[
                '성경본문 입력',
                '본문 관찰·해석',
                '핵심 메시지 도출',
                '설교 기획',
                '매체별 콘텐츠 변환',
                '산출물 생성',
              ].map((step, i, arr) => (
                <li key={step} className="flex items-center gap-2">
                  <span className="rounded-md bg-muted px-2.5 py-1 font-medium text-foreground">
                    {step}
                  </span>
                  {i < arr.length - 1 && <span className="text-primary">→</span>}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
