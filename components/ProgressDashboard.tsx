import * as React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import type { FaithOpsProject } from '@/lib/types';

export function ProgressDashboard({ project }: { project: FaithOpsProject }) {
  const total = project.outputs.length;
  const reviewed = project.outputs.filter(
    (o) => o.status === 'reviewed' || o.status === 'approved'
  ).length;

  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-sm text-muted-foreground">예배 준비율</p>
            <p className="text-3xl font-bold text-primary">{project.progress}%</p>
          </div>
          <p className="text-sm text-muted-foreground">
            검수 완료 {reviewed} / {total}
          </p>
        </div>
        <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${project.progress}%` }}
          />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
          <Stat label="본문" value={project.input.bibleReference || '—'} />
          <Stat label="대상" value={project.input.audience} />
          <Stat label="예배 유형" value={project.input.serviceType} />
          <Stat label="설교 길이" value={project.input.sermonLength} />
          <Stat label="방향" value={project.input.tone} />
          <Stat label="산출물 수" value={`${total}개`} />
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/60 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="truncate font-medium">{value}</p>
    </div>
  );
}
