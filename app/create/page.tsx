'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { BibleInputForm } from '@/components/BibleInputForm';
import { upsertProject, newId, computeProgress } from '@/lib/storage';
import type { ProjectInput, GeneratedOutput, FaithOpsProject } from '@/lib/types';

export default function CreatePage() {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleGenerate(input: ProjectInput) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input, types: input.outputs }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '생성에 실패했습니다.');
      }
      const outputs = data.outputs as GeneratedOutput[];
      const now = new Date().toISOString();
      const project: FaithOpsProject = {
        id: newId(),
        input,
        outputs,
        progress: 0,
        createdAt: now,
        updatedAt: now,
      };
      project.progress = computeProgress(project);
      upsertProject(project);
      router.push(`/results/${project.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : '알 수 없는 오류');
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">본문 입력</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          이번 주 예배 본문과 옵션을 입력하면 선택한 산출물이 생성됩니다.
        </p>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      )}

      <BibleInputForm loading={loading} onGenerate={handleGenerate} />
    </div>
  );
}
