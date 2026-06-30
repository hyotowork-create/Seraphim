import * as React from 'react';

/** **bold** 와 `code` 인라인 마크업을 React 노드로 변환한다. */
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const token = m[0];
    if (token.startsWith('**')) {
      nodes.push(
        <strong key={`${keyPrefix}-b-${i}`}>{token.slice(2, -2)}</strong>
      );
    } else {
      nodes.push(
        <code
          key={`${keyPrefix}-c-${i}`}
          className="rounded bg-muted px-1.5 py-0.5 text-[0.85em] text-primary"
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    last = m.index + token.length;
    i++;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

/**
 * 외부 라이브러리 없이 mock 산출물에서 쓰는 마크다운 부분집합을 렌더링한다.
 * 지원: 제목(#~###), 목록(-, 1.), 표(|), 코드펜스(```), 인용(>), 구분선(---).
 */
export function Markdown({ content }: { content: string }) {
  const lines = content.split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 코드 펜스
    if (line.trim().startsWith('```')) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        buf.push(lines[i]);
        i++;
      }
      i++; // 닫는 펜스 건너뛰기
      blocks.push(
        <pre
          key={key++}
          className="my-3 overflow-x-auto rounded-md bg-foreground/[0.04] p-3 text-xs leading-relaxed"
        >
          {buf.join('\n')}
        </pre>
      );
      continue;
    }

    // 표
    if (line.includes('|') && lines[i + 1]?.includes('---')) {
      const header = line.split('|').map((c) => c.trim()).filter(Boolean);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].includes('|')) {
        rows.push(lines[i].split('|').map((c) => c.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length));
        i++;
      }
      blocks.push(
        <div key={key++} className="my-3 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {header.map((h, hi) => (
                  <th
                    key={hi}
                    className="border border-border bg-muted px-3 py-1.5 text-left font-semibold"
                  >
                    {renderInline(h, `h${key}-${hi}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, ci) => (
                    <td key={ci} className="border border-border px-3 py-1.5 align-top">
                      {renderInline(c, `r${ri}-${ci}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // 제목
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const txt = heading[2];
      const cls =
        level === 1
          ? 'mt-5 mb-2 text-xl font-bold'
          : level === 2
          ? 'mt-4 mb-2 text-lg font-semibold'
          : 'mt-3 mb-1.5 text-base font-semibold';
      blocks.push(
        <p key={key++} className={cls}>
          {renderInline(txt, `hd${key}`)}
        </p>
      );
      i++;
      continue;
    }

    // 인용
    if (line.trim().startsWith('>')) {
      blocks.push(
        <blockquote
          key={key++}
          className="my-2 border-l-4 border-accent-foreground/40 bg-accent/40 px-3 py-2 text-sm"
        >
          {renderInline(line.replace(/^>\s?/, ''), `q${key}`)}
        </blockquote>
      );
      i++;
      continue;
    }

    // 구분선
    if (/^---+$/.test(line.trim())) {
      blocks.push(<hr key={key++} className="my-4 border-border" />);
      i++;
      continue;
    }

    // 목록 (연속 라인 묶기)
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const items: string[] = [];
      let ordered = /^\s*\d+\.\s+/.test(line);
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, ''));
        i++;
      }
      const ListTag = ordered ? 'ol' : 'ul';
      blocks.push(
        <ListTag
          key={key++}
          className={`my-2 ml-5 space-y-1 text-sm ${ordered ? 'list-decimal' : 'list-disc'}`}
        >
          {items.map((it, ii) => (
            <li key={ii}>{renderInline(it, `li${key}-${ii}`)}</li>
          ))}
        </ListTag>
      );
      continue;
    }

    // 빈 줄
    if (line.trim() === '') {
      i++;
      continue;
    }

    // 일반 문단
    blocks.push(
      <p key={key++} className="my-1.5 text-sm leading-relaxed">
        {renderInline(line, `p${key}`)}
      </p>
    );
    i++;
  }

  return <div className="prose-faithops">{blocks}</div>;
}
