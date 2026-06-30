'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/field';
import { CopyButton } from '@/components/CopyButton';
import { Markdown } from '@/components/Markdown';
import { OUTPUT_META } from '@/lib/types';
import type { GeneratedOutput, OutputStatus } from '@/lib/types';

const STATUS_STYLE: Record<OutputStatus, string> = {
  draft: 'bg-amber-100 text-amber-700',
  reviewed: 'bg-sky-100 text-sky-700',
  approved: 'bg-emerald-100 text-emerald-700',
};

const STATUS_LABEL: Record<OutputStatus, string> = {
  draft: '초안',
  reviewed: '검수됨',
  approved: '승인됨',
};

export function OutputCard({
  output,
  regenerating,
  onRegenerate,
  onStatusChange,
  isSlack,
  onSendSlack,
}: {
  output: GeneratedOutput;
  regenerating: boolean;
  onRegenerate: () => void;
  onStatusChange: (status: OutputStatus) => void;
  isSlack?: boolean;
  onSendSlack?: () => void;
}) {
  // 다음 검수 단계로 순환: draft → reviewed → approved → draft
  const nextStatus: OutputStatus =
    output.status === 'draft'
      ? 'reviewed'
      : output.status === 'reviewed'
      ? 'approved'
      : 'draft';

  return (
    <div className="rounded-lg border border-border bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold">
            {OUTPUT_META[output.type].label}
          </h2>
          <Badge className={STATUS_STYLE[output.status]}>
            {STATUS_LABEL[output.status]}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CopyButton text={output.content} />
          <Button
            variant="outline"
            size="sm"
            onClick={onRegenerate}
            disabled={regenerating}
          >
            {regenerating ? '생성 중…' : '다시 생성'}
          </Button>
          <Button variant="subtle" size="sm" onClick={() => onStatusChange(nextStatus)}>
            {output.status === 'draft'
              ? '검수 완료 표시'
              : output.status === 'reviewed'
              ? '승인 표시'
              : '초안으로 되돌리기'}
          </Button>
          {isSlack && onSendSlack && (
            <Button size="sm" onClick={onSendSlack}>
              Slack 전송
            </Button>
          )}
        </div>
      </div>
      <div className="px-4 py-3">
        <Markdown content={output.content} />
      </div>
    </div>
  );
}
