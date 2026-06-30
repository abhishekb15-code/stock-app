import React from 'react';

/**
 * Tiny zero-dependency Markdown renderer — enough for the AI analyst's output:
 * headings, bold/italic/inline-code, bullet & numbered lists, GitHub-style
 * tables, code fences, blockquotes and paragraphs. Not a full CommonMark impl.
 */

// Inline: **bold**, *italic*, `code`, [text](url)
function inline(text, keyBase) {
  const nodes = [];
  let i = 0, key = 0;
  const re = /(\*\*([^*]+)\*\*)|(`([^`]+)`)|(\*([^*]+)\*)|(\[([^\]]+)\]\((https?:\/\/[^)\s]+)\))/g;
  let m, last = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[1]) nodes.push(<strong key={`${keyBase}-b${key++}`}>{m[2]}</strong>);
    else if (m[3]) nodes.push(<code key={`${keyBase}-c${key++}`} className="md-code">{m[4]}</code>);
    else if (m[5]) nodes.push(<em key={`${keyBase}-i${key++}`}>{m[6]}</em>);
    else if (m[7]) nodes.push(<a key={`${keyBase}-a${key++}`} href={m[9]} target="_blank" rel="noreferrer">{m[8]}</a>);
    last = re.lastIndex;
    i = last;
  }
  if (i < text.length) nodes.push(text.slice(i));
  return nodes;
}

function isTableSep(line) {
  return /^\s*\|?[\s:|-]+\|?\s*$/.test(line) && line.includes('-');
}
function splitRow(line) {
  return line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(c => c.trim());
}

export default function Markdown({ text }) {
  const lines = (text || '').replace(/\r/g, '').split('\n');
  const blocks = [];
  let i = 0, k = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code fence
    if (/^```/.test(line)) {
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++; // closing fence
      blocks.push(<pre key={k++} className="md-pre"><code>{buf.join('\n')}</code></pre>);
      continue;
    }

    // Heading
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const lvl = h[1].length;
      const Tag = `h${Math.min(lvl + 1, 5)}`;
      blocks.push(React.createElement(Tag, { key: k++, className: 'md-h' }, inline(h[2], `h${k}`)));
      i++;
      continue;
    }

    // Horizontal rule
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) { blocks.push(<hr key={k++} className="md-hr" />); i++; continue; }

    // Table
    if (line.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const header = splitRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
        rows.push(splitRow(lines[i])); i++;
      }
      blocks.push(
        <div key={k++} className="md-table-wrap">
          <table className="md-table">
            <thead><tr>{header.map((c, ci) => <th key={ci}>{inline(c, `th${k}-${ci}`)}</th>)}</tr></thead>
            <tbody>{rows.map((r, ri) => <tr key={ri}>{r.map((c, ci) => <td key={ci}>{inline(c, `td${k}-${ri}-${ci}`)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      );
      continue;
    }

    // Blockquote
    if (/^\s*>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ''));
      blocks.push(<blockquote key={k++} className="md-quote">{inline(buf.join(' '), `q${k}`)}</blockquote>);
      continue;
    }

    // Unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, '')); i++;
      }
      blocks.push(<ul key={k++} className="md-ul">{items.map((it, ii) => <li key={ii}>{inline(it, `li${k}-${ii}`)}</li>)}</ul>);
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, '')); i++;
      }
      blocks.push(<ol key={k++} className="md-ol">{items.map((it, ii) => <li key={ii}>{inline(it, `oli${k}-${ii}`)}</li>)}</ol>);
      continue;
    }

    // Blank line
    if (line.trim() === '') { i++; continue; }

    // Paragraph (gather consecutive non-empty, non-special lines)
    const buf = [line];
    i++;
    while (i < lines.length && lines[i].trim() !== '' &&
           !/^(#{1,4}\s|```|\s*[-*]\s|\s*\d+\.\s|\s*>\s)/.test(lines[i]) &&
           !(lines[i].includes('|') && isTableSep(lines[i + 1] || ''))) {
      buf.push(lines[i++]);
    }
    blocks.push(<p key={k++} className="md-p">{inline(buf.join(' '), `p${k}`)}</p>);
  }

  return <div className="md">{blocks}</div>;
}
