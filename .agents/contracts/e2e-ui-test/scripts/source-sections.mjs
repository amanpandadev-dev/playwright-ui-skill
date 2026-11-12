// Structural Markdown enumeration for gate G-D01. Static and meaning-free: it finds a
// heading's section and splits it into content units, so an inventory must account for every unit by index.
// A unit is a list item (bulleted or numbered, nested items separately), a table body row, a paragraph or
// block quote, or a fenced code block. Headings inside the section are structure, not units.
// Kept local (not imported from validate-coverage.mjs) so the two modules do not import each other.
const normalizeText = value => value.replace(/\r\n?/g, '\n');

const HEADING = /^(#{1,6})\s+\S/;
const LIST = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const FENCE = /^\s*(```|~~~)/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;

// Returns the section lines under `heading` (an exact heading line), or an error string.
export function findSection(text, heading) {
  const lines = normalizeText(text).replace(/^﻿/, '').split('\n');
  const wanted = heading.trim();
  const starts = lines.map((l, i) => (l.trimEnd() === wanted ? i : -1)).filter(i => i >= 0);
  if (starts.length === 0) return { error: `heading not found: ${wanted}` };
  if (starts.length > 1) return { error: `heading occurs ${starts.length} times: ${wanted}` };
  const level = (wanted.match(/^#+/) || [''])[0].length;
  if (!level) return { error: `not a Markdown heading: ${wanted}` };
  const body = [];
  for (let i = starts[0] + 1; i < lines.length; i++) {
    const m = lines[i].match(HEADING);
    if (m && m[1].length <= level) break;
    body.push(lines[i]);
  }
  return { lines: body };
}

// Every heading line in a document, in order.
export function headings(text) {
  const out = [];
  let fenced = false;
  for (const line of normalizeText(text).replace(/^﻿/, '').split('\n')) {
    if (FENCE.test(line)) { fenced = !fenced; continue; }
    if (!fenced && HEADING.test(line)) out.push(line.trimEnd());
  }
  return out;
}

export function enumerateUnits(lines) {
  const units = [];
  const push = (kind, textLines) => units.push({ index: units.length + 1, kind, text: textLines.join(' ').replace(/\s+/g, ' ').trim() });
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || HEADING.test(line)) { i++; continue; }
    if (FENCE.test(line)) {
      const marker = line.trim().slice(0, 3);
      const block = [line];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(marker)) block.push(lines[i++]);
      if (i < lines.length) block.push(lines[i++]);
      push('code-block', block);
      continue;
    }
    if (line.trimStart().startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].trimStart().startsWith('|')) rows.push(lines[i++]);
      const hasHeader = rows.length > 1 && TABLE_SEPARATOR.test(rows[1]);
      for (const row of hasHeader ? rows.slice(2) : rows) push('table-row', [row]);
      continue;
    }
    const list = line.match(LIST);
    if (list) {
      const indent = list[1].length;
      const item = [list[3]];
      i++;
      while (i < lines.length && lines[i].trim() && !LIST.test(lines[i]) && !HEADING.test(lines[i]) && !FENCE.test(lines[i])
        && !lines[i].trimStart().startsWith('|') && lines[i].match(/^\s*/)[0].length > indent) item.push(lines[i++].trim());
      push(/\d/.test(list[2]) ? 'numbered-item' : 'list-item', item);
      continue;
    }
    const paragraph = [];
    while (i < lines.length && lines[i].trim() && !LIST.test(lines[i]) && !HEADING.test(lines[i]) && !FENCE.test(lines[i])
      && !lines[i].trimStart().startsWith('|')) paragraph.push(lines[i++].trim().replace(/^>\s?/, ''));
    push('paragraph', paragraph);
  }
  return units;
}

// Whitespace-insensitive containment used to bind an extracted clause to its unit.
export const squash = value => normalizeText(value).replace(/\s+/g, ' ').trim();
