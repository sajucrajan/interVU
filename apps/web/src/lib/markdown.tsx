import { Fragment, type ReactNode } from "react";

/**
 * A small Markdown renderer for the repository's own docs (the /guide page
 * reads docs/14 at build time). It covers what those files use and nothing
 * more: headings, paragraphs, bullet and numbered lists (one level of
 * nesting), pipe tables, fenced code, block quotes, rules, and inline bold,
 * italic, code and links. Anything else renders as text, never as HTML.
 */

function inline(text: string, key = 0): ReactNode {
  const out: ReactNode[] = [];
  // code first, so markers inside backticks are left alone
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*)|(\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("`")) out.push(<code key={`${key}-${i++}`}>{tok.slice(1, -1)}</code>);
    else if (tok.startsWith("**")) out.push(<strong key={`${key}-${i++}`}>{inline(tok.slice(2, -2), i)}</strong>);
    else if (tok.startsWith("[")) {
      const mm = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(tok)!;
      const href = mm[2]!;
      const external = /^https?:\/\//.test(href);
      out.push(
        <a key={`${key}-${i++}`} href={href} {...(external ? { target: "_blank", rel: "noreferrer" } : {})}>
          {inline(mm[1]!, i)}
        </a>,
      );
    } else out.push(<em key={`${key}-${i++}`}>{inline(tok.slice(1, -1), i)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out.length === 1 ? out[0] : out;
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[`*_]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

interface ListItem {
  text: string;
  children: ListItem[];
}

function parseList(lines: string[], start: number): { node: ReactNode; next: number } {
  // Collect this list's lines (and nested ones, by indentation).
  const items: ListItem[] = [];
  const ordered = /^\s*\d+\.\s/.test(lines[start]!);
  let i = start;
  while (i < lines.length) {
    const line = lines[i]!;
    const top = /^(?:[-*]|\d+\.)\s+(.*)$/.exec(line);
    const nested = /^\s{2,}(?:[-*]|\d+\.)\s+(.*)$/.exec(line);
    const cont = /^\s{2,}(\S.*)$/.exec(line);
    if (top) items.push({ text: top[1]!, children: [] });
    else if (nested && items.length) items[items.length - 1]!.children.push({ text: nested[1]!, children: [] });
    else if (cont && items.length) {
      const it = items[items.length - 1]!;
      const target = it.children.length ? it.children[it.children.length - 1]! : it;
      target.text += " " + cont[1]!;
    } else break;
    i++;
  }
  const render = (list: ListItem[], ord: boolean, key: string): ReactNode => {
    const Tag = ord ? "ol" : "ul";
    return (
      <Tag key={key}>
        {list.map((it, j) => (
          <li key={j}>
            {inline(it.text, j)}
            {it.children.length > 0 && render(it.children, false, `${key}-${j}`)}
          </li>
        ))}
      </Tag>
    );
  };
  return { node: render(items, ordered, `l${start}`), next: i };
}

function parseTable(lines: string[], start: number): { node: ReactNode; next: number } {
  const rows: string[][] = [];
  let i = start;
  while (i < lines.length && lines[i]!.trim().startsWith("|")) {
    const cells = lines[i]!.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
    if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
    i++;
  }
  const [head, ...body] = rows;
  const headed = head && head.some((c) => c.length > 0);
  return {
    node: (
      <div key={`t${start}`} className="md-table">
        <table className="data">
          {headed && (
            <thead>
              <tr>
                {head.map((c, j) => (
                  <th key={j}>{inline(c, j)}</th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {(headed ? body : rows).map((r, j) => (
              <tr key={j}>
                {r.map((c, k) => (
                  <td key={k}>{inline(c, k)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ),
    next: i,
  };
}

export function renderMarkdown(src: string): ReactNode[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const out: ReactNode[] = [];
  let i = 0;
  let para: string[] = [];
  const flush = () => {
    if (para.length) {
      out.push(<p key={`p${out.length}`}>{inline(para.join(" "), out.length)}</p>);
      para = [];
    }
  };
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.startsWith("```")) {
      flush();
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.startsWith("```")) code.push(lines[i++]!);
      i++;
      out.push(
        <pre key={`c${out.length}`}>
          <code>{code.join("\n")}</code>
        </pre>,
      );
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      flush();
      const level = h[1]!.length;
      const text = h[2]!;
      const id = slug(text);
      const content = inline(text, out.length);
      out.push(
        level === 1 ? <h1 key={id} id={id}>{content}</h1>
        : level === 2 ? <h2 key={id} id={id}>{content}</h2>
        : level === 3 ? <h3 key={id} id={id}>{content}</h3>
        : <h4 key={id} id={id}>{content}</h4>,
      );
      i++;
      continue;
    }
    if (/^-{3,}\s*$/.test(line)) {
      flush();
      out.push(<hr key={`hr${out.length}`} />);
      i++;
      continue;
    }
    if (line.startsWith(">")) {
      flush();
      const q: string[] = [];
      while (i < lines.length && lines[i]!.startsWith(">")) q.push(lines[i++]!.replace(/^>\s?/, ""));
      out.push(<blockquote key={`q${out.length}`}>{renderMarkdown(q.join("\n"))}</blockquote>);
      continue;
    }
    if (line.trim().startsWith("|")) {
      flush();
      const t = parseTable(lines, i);
      out.push(t.node);
      i = t.next;
      continue;
    }
    if (/^(?:[-*]|\d+\.)\s+/.test(line)) {
      flush();
      const l = parseList(lines, i);
      out.push(l.node);
      i = l.next;
      continue;
    }
    if (line.trim() === "") {
      flush();
      i++;
      continue;
    }
    para.push(line.trim());
    i++;
  }
  flush();
  return out.map((n, j) => <Fragment key={j}>{n}</Fragment>);
}
