import type { ReactNode } from "react";

/**
 * A mono label, a hairline that fills the remaining width, and an optional
 * right-hand action. Replaces `<h2>` throughout — most of the app's editorial
 * feel comes from this one primitive.
 */
export function SectionHead({
  label,
  action,
}: {
  label: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-head">
      <h2 className="mono-label" style={{ margin: 0 }}>
        {label}
      </h2>
      {action && <span className="section-action">{action}</span>}
    </div>
  );
}
