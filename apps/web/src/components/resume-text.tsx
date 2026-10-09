/**
 * Resume text, reflowed.
 *
 * Extracted text keeps the source file's hard line breaks, so rendering it
 * verbatim left lines like "Comfortable owning a" with the sentence finishing
 * on the next line — ragged in any column narrower than the original page.
 *
 * A line is joined onto the previous one only when it plainly continues the
 * same sentence: it starts with a lowercase letter and is not indented. Every
 * other break is kept, because in a resume a new line almost always means
 * something — a new role, a new bullet, a date range. Blank lines stay
 * paragraph breaks. Still rendered as text, never as HTML: it came from an
 * uploaded file.
 */
export function ResumeText({ body }: { body: string }) {
  const paragraphs = body.replace(/\r\n?/g, "\n").split(/\n\s*\n/);
  return (
    <div className="resume-text">
      {paragraphs.map((para, i) => {
        const lines: string[] = [];
        for (const raw of para.split("\n")) {
          const continues = lines.length > 0 && /^[a-z]/.test(raw);
          if (continues) lines[lines.length - 1] += ` ${raw.trim()}`;
          else lines.push(raw);
        }
        return (
          <p key={i}>
            {lines.map((line, j) => {
              const indent = /^\s+/.test(line);
              return (
                <span key={j} className={indent ? "indent" : undefined}>
                  {line.trim()}
                </span>
              );
            })}
          </p>
        );
      })}
    </div>
  );
}
