'use client';

import * as React from 'react';
import { OUTPUT_META } from '@/lib/types';
import type { GeneratedOutput, OutputType } from '@/lib/types';

export function OutputTabs({
  outputs,
  active,
  onSelect,
}: {
  outputs: GeneratedOutput[];
  active: OutputType;
  onSelect: (type: OutputType) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5 rounded-lg border border-border bg-white p-1.5">
      {outputs.map((o) => {
        const isActive = o.type === active;
        return (
          <button
            key={o.type}
            onClick={() => onSelect(o.type)}
            className={
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors ' +
              (isActive
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted')
            }
          >
            {OUTPUT_META[o.type].short}
            {(o.status === 'reviewed' || o.status === 'approved') && (
              <span className="ml-1 text-emerald-400">✓</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
