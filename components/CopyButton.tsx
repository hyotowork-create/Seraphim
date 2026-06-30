'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';

export function CopyButton({
  text,
  label = '복사하기',
}: {
  text: string;
  label?: string;
}) {
  const [copied, setCopied] = React.useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // 클립보드 API 미지원 환경 폴백
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Button variant="outline" size="sm" onClick={handleCopy}>
      {copied ? '✓ 복사됨' : label}
    </Button>
  );
}
