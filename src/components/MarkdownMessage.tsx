import React from 'react';

interface MarkdownMessageProps {
  text: string;
}

function renderInline(line: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let idx = 0;

  while ((match = pattern.exec(line)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(line.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      nodes.push(
        <strong key={`${keyPrefix}-b-${idx++}`} className="font-bold text-[var(--text-primary)]">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith('`') && token.endsWith('`')) {
      nodes.push(
        <code
          key={`${keyPrefix}-c-${idx++}`}
          dir="ltr"
          className="inline-block whitespace-nowrap px-1.5 py-0.5 rounded bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[11px] font-mono text-[var(--text-primary)]"
        >
          {token.slice(1, -1)}
        </code>,
      );
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < line.length) {
    nodes.push(line.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : [line];
}

function parseTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((c) => c.trim());
}

function isTableSeparator(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes('|')) return false;
  const cells = parseTableRow(trimmed);
  return cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c));
}

export const MarkdownMessage: React.FC<MarkdownMessageProps> = ({ text }) => {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let blockKey = 0;

  while (i < lines.length) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    // Markdown table block
    if (trimmed.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const headers = parseTableRow(trimmed);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().includes('|') && !isTableSeparator(lines[i])) {
        rows.push(parseTableRow(lines[i]));
        i += 1;
      }
      const k = blockKey++;
      blocks.push(
        <div
          key={`tbl-${k}`}
          className="my-2 overflow-x-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]"
        >
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr className="bg-[var(--bg-subtle)] border-b border-[var(--border-subtle)]">
                {headers.map((h, hi) => (
                  <th
                    key={hi}
                    className="px-2.5 py-1.5 font-bold text-start text-[var(--text-secondary)] whitespace-nowrap"
                  >
                    {renderInline(h, `th-${k}-${hi}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr
                  key={ri}
                  className="border-b last:border-b-0 border-[var(--border-subtle)]/70 hover:bg-[var(--bg-subtle)]/50"
                >
                  {headers.map((_h, ci) => {
                    const cell = row[ci] ?? '-';
                    const isLongText = cell.length > 22 && /\s/.test(cell);
                    return (
                      <td
                        key={ci}
                        className={`px-2.5 py-1.5 text-start text-[var(--text-primary)] align-top ${
                          isLongText ? 'min-w-[150px] whitespace-normal' : 'whitespace-nowrap'
                        }`}
                      >
                        {renderInline(cell, `td-${k}-${ri}-${ci}`)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    // Heading
    const headingMatch = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const content = headingMatch[2];
      const k = blockKey++;
      blocks.push(
        <div
          key={`h-${k}`}
          dir="auto"
          className={
            level === 1
              ? 'text-sm font-extrabold text-[var(--text-primary)] pt-1'
              : level === 2
                ? 'text-[13px] font-bold text-[var(--text-primary)] pt-1'
                : 'text-xs font-bold text-[var(--accent-primary)] pt-1'
          }
        >
          {renderInline(content, `h-${k}`)}
        </div>,
      );
      i += 1;
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      blocks.push(<hr key={`hr-${blockKey++}`} className="border-[var(--border-subtle)] my-1.5" />);
      i += 1;
      continue;
    }

    // Unordered list
    if (/^[-*•]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*•]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*•]\s+/, ''));
        i += 1;
      }
      const k = blockKey++;
      blocks.push(
        <ul key={`ul-${k}`} className="space-y-1 ps-4 list-disc marker:text-[var(--accent-primary)]">
          {items.map((item, idx) => (
            <li key={idx} dir="auto" className="text-xs leading-6">
              {renderInline(item, `ul-${k}-${idx}`)}
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    // Ordered list
    if (/^\d+[.)]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+[.)]\s+/, ''));
        i += 1;
      }
      const k = blockKey++;
      blocks.push(
        <ol key={`ol-${k}`} className="space-y-1 ps-5 list-decimal marker:text-[var(--text-muted)]">
          {items.map((item, idx) => (
            <li key={idx} dir="auto" className="text-xs leading-6">
              {renderInline(item, `ol-${k}-${idx}`)}
            </li>
          ))}
        </ol>,
      );
      continue;
    }

    // Paragraph (coalesce consecutive plain lines)
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^(#{1,3})\s+/.test(lines[i].trim()) &&
      !/^[-*•]\s+/.test(lines[i].trim()) &&
      !/^\d+[.)]\s+/.test(lines[i].trim()) &&
      !(lines[i].trim().includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1]))
    ) {
      paraLines.push(lines[i].trim());
      i += 1;
    }
    const k = blockKey++;
    blocks.push(
      <p key={`p-${k}`} dir="auto" className="text-xs leading-6 whitespace-pre-wrap break-words">
        {paraLines.map((pl, idx) => (
          <React.Fragment key={idx}>
            {idx > 0 && <br />}
            {renderInline(pl, `p-${k}-${idx}`)}
          </React.Fragment>
        ))}
      </p>,
    );
  }

  return <div className="space-y-1.5 flex-1 min-w-0">{blocks}</div>;
};
