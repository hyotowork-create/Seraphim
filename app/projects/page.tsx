'use client';

import * as React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/field';
import { loadProjects, deleteProject } from '@/lib/storage';
import type { FaithOpsProject } from '@/lib/types';

export default function ProjectsPage() {
  const [projects, setProjects] = React.useState<FaithOpsProject[]>([]);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    setProjects(loadProjects());
    setReady(true);
  }, []);

  function handleDelete(id: string) {
    if (!window.confirm('이 프로젝트를 삭제할까요?')) return;
    deleteProject(id);
    setProjects(loadProjects());
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">자료 보관함</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            이전에 생성한 예배자료 프로젝트를 다시 열 수 있습니다.
          </p>
        </div>
        <Link href="/create">
          <Button>새 자료 생성</Button>
        </Link>
      </div>

      {!ready ? (
        <p className="text-sm text-muted-foreground">불러오는 중…</p>
      ) : projects.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">아직 생성한 자료가 없습니다.</p>
            <Link href="/create" className="mt-4 inline-block">
              <Button>첫 예배자료 생성하기</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {projects.map((p) => (
            <Card key={p.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-5">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold">
                      {p.input.bibleReference || '제목 없음'}
                    </p>
                    <Badge className="bg-accent text-accent-foreground">
                      {p.input.audience}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {p.input.serviceType} · 산출물 {p.outputs.length}개 · 준비율{' '}
                    {p.progress}% · {new Date(p.createdAt).toLocaleString('ko-KR')}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Link href={`/results/${p.id}`}>
                    <Button variant="outline" size="sm">
                      열기
                    </Button>
                  </Link>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(p.id)}
                  >
                    삭제
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
