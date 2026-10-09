import type { ReactNode } from "react";

/**
 * The header every app page opens with: a mono label saying where you are,
 * the title, one line saying what the page is for, and the page's actions.
 *
 * Half the pages had grown their own version — some with the label, some
 * without, some with the primary action floating under the title — so moving
 * between them felt like moving between products. This is the dashboard's
 * header, extracted, so the rest can match it without copying markup.
 */
export function PageHead({
  kicker,
  title,
  lede,
  actions,
}: {
  kicker?: ReactNode;
  title: ReactNode;
  lede?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="page-head">
      <div className="page-head-main">
        {kicker && <div className="mono-label">{kicker}</div>}
        <h1 style={{ marginTop: kicker ? 12 : 0 }}>{title}</h1>
        {lede && (
          <p className="dossier-meta" style={{ maxWidth: "64ch" }}>
            {lede}
          </p>
        )}
      </div>
      {actions && <div className="page-head-actions">{actions}</div>}
    </header>
  );
}
