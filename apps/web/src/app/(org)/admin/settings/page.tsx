"use client";

import { useEffect, useState } from "react";
import { api, apiErrorMessage, isForbidden } from "@/lib/api";
import { AccessDenied } from "@/components/access-denied";
import { PageHead } from "@/components/page-head";
import { SectionHead } from "@/components/section-head";

interface OrgSettings {
  ownership_scope?: "position" | "organization";
  ownership_window_days?: number;
  feedback_visibility?: "open" | "hidden_until_submitted";
  default_phone_region?: string;
  wip_caps?: { screening?: number | null; interviewing?: number | null };
  notifications?: {
    email_enabled?: boolean;
    scorecard_reminders?: boolean;
    slack_webhook_url?: string | null;
    teams_webhook_url?: string | null;
  };
}

interface Settings {
  name: string;
  slug: string;
  settings: OrgSettings;
}

interface Form {
  ownership_scope: "position" | "organization";
  ownership_window_days: string;
  feedback_visibility: "open" | "hidden_until_submitted";
  default_phone_region: string;
  wip_screening: string;
  wip_interviewing: string;
  email_enabled: boolean;
  scorecard_reminders: boolean;
  slack_webhook_url: string;
  teams_webhook_url: string;
}

const toForm = (s: OrgSettings): Form => ({
  ownership_scope: s.ownership_scope ?? "position",
  ownership_window_days: String(s.ownership_window_days ?? 180),
  feedback_visibility: s.feedback_visibility ?? "hidden_until_submitted",
  default_phone_region: (s.default_phone_region ?? "US").toUpperCase(),
  wip_screening: s.wip_caps?.screening ? String(s.wip_caps.screening) : "",
  wip_interviewing: s.wip_caps?.interviewing ? String(s.wip_caps.interviewing) : "",
  email_enabled: s.notifications?.email_enabled ?? true,
  scorecard_reminders: s.notifications?.scorecard_reminders ?? true,
  slack_webhook_url: s.notifications?.slack_webhook_url ?? "",
  teams_webhook_url: s.notifications?.teams_webhook_url ?? "",
});

/**
 * The organization's rules (docs/01, docs/05 §4): how long an agency owns
 * an introduction, whether a scorecard stays sealed until the reader has
 * filed, which country phone numbers default to, how full a stage may get,
 * and where notifications go. These lived only in the API until now.
 */
export default function SettingsPage() {
  const [org, setOrg] = useState<Settings | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [saved, setSaved] = useState<Form | null>(null);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    api<Settings>("/settings")
      .then((s) => {
        setOrg(s);
        const f = toForm(s.settings ?? {});
        setForm(f);
        setSaved(f);
      })
      .catch((e) => {
        if (isForbidden(e)) setDenied(true);
        else setError(apiErrorMessage(e));
      });
  }, []);

  if (denied) {
    return (
      <AccessDenied
        what="Settings"
        why="The organization's rules are set by the admin."
        back={{ href: "/dashboard", label: "Back to Today" }}
      />
    );
  }
  if (!org || !form) return <main className="wide muted">{error ?? "Loading…"}</main>;

  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm({ ...form, [k]: v });

  async function save() {
    if (!form) return;
    setBusy(true);
    setError(null);
    setFlash(null);
    const days = Number(form.ownership_window_days);
    if (!Number.isInteger(days) || days < 1 || days > 3650) {
      setError("The ownership window is a whole number of days, 1 to 3650.");
      setBusy(false);
      return;
    }
    const cap = (v: string) => (v.trim() === "" ? null : Number(v));
    try {
      const body = {
        ownership_scope: form.ownership_scope,
        ownership_window_days: days,
        feedback_visibility: form.feedback_visibility,
        default_phone_region: form.default_phone_region.trim().toUpperCase(),
        wip_caps: { screening: cap(form.wip_screening), interviewing: cap(form.wip_interviewing) },
        notifications: {
          email_enabled: form.email_enabled,
          scorecard_reminders: form.scorecard_reminders,
          slack_webhook_url: form.slack_webhook_url.trim() || null,
          teams_webhook_url: form.teams_webhook_url.trim() || null,
        },
      };
      const s = await api<Settings>("/settings", { method: "PATCH", body });
      const f = toForm(s.settings ?? {});
      setForm(f);
      setSaved(f);
      setFlash("Saved.");
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="wide">
      <PageHead
        kicker="Admin · rules"
        title="Settings"
        lede={`How ${org.name} hires: who owns an introduction and for how long, when a scorecard can be read, and where notifications go.`}
        actions={
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="secondary" disabled={!dirty || busy} onClick={() => setForm(saved)}>
              Discard changes
            </button>
            <button type="button" disabled={!dirty || busy} onClick={save}>
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        }
      />
      {error && <p className="error">{error}</p>}
      {flash && !dirty && <p className="ap-flash">{flash}</p>}

      <div className="st-grid">
        <section className="card st-card">
          <SectionHead label="Agency ownership" />
          <p className="muted st-hint">
            When an agency introduces a candidate, that introduction is theirs for a while: a second
            agency sending the same person is told &ldquo;already in process from another
            source&rdquo;, and the organization cannot add them directly either.
          </p>
          <div className="st-field">
            <span className="st-label">Scope of the claim</span>
            <label className="ap-radio">
              <input type="radio" name="scope" checked={form.ownership_scope === "position"} onChange={() => set("ownership_scope", "position")} />
              <span><strong>Per position.</strong> The claim covers this role only; another agency may introduce the same person for a different role.</span>
            </label>
            <label className="ap-radio">
              <input type="radio" name="scope" checked={form.ownership_scope === "organization"} onChange={() => set("ownership_scope", "organization")} />
              <span><strong>Organization-wide.</strong> Whoever introduced the person first owns them for every role.</span>
            </label>
          </div>
          <div className="st-field st-inline">
            <label htmlFor="window">
              <span className="st-label">Length of the claim</span>
              <span className="muted st-hint">Days from the introduction. 180 is the common contract term.</span>
            </label>
            <input id="window" type="number" min={1} max={3650} value={form.ownership_window_days} onChange={(e) => set("ownership_window_days", e.target.value)} style={{ width: 110 }} />
          </div>
        </section>

        <section className="card st-card">
          <SectionHead label="Scorecards" />
          <div className="st-field">
            <span className="st-label">Who can read a colleague&rsquo;s scorecard, and when</span>
            <label className="ap-radio">
              <input type="radio" name="fv" checked={form.feedback_visibility === "hidden_until_submitted"} onChange={() => set("feedback_visibility", "hidden_until_submitted")} />
              <span><strong>Hidden until you have filed your own.</strong> Nobody is swayed by what a colleague wrote. The debrief stays sealed until the whole panel is in. Recommended.</span>
            </label>
            <label className="ap-radio">
              <input type="radio" name="fv" checked={form.feedback_visibility === "open"} onChange={() => set("feedback_visibility", "open")} />
              <span><strong>Open.</strong> Anyone who can see the candidate can read every scorecard as soon as it is filed.</span>
            </label>
          </div>
        </section>

        <section className="card st-card">
          <SectionHead label="Pipeline" />
          <div className="st-field st-inline">
            <label htmlFor="region">
              <span className="st-label">Default country for phone numbers</span>
              <span className="muted st-hint">Two-letter code. A number typed without a country code is read as this country, which is what lets two agencies&rsquo; spellings of the same number match.</span>
            </label>
            <input id="region" maxLength={2} value={form.default_phone_region} onChange={(e) => set("default_phone_region", e.target.value.toUpperCase())} style={{ width: 70, textTransform: "uppercase" }} />
          </div>
          <div className="st-field">
            <span className="st-label">Work-in-progress caps</span>
            <span className="muted st-hint">The board shows a column as over capacity past this many candidates. Leave empty for no cap.</span>
            <div className="row" style={{ gap: 16, marginTop: 6 }}>
              <label className="st-cap">
                <span>Screening</span>
                <input id="cap-screening" type="number" min={1} max={999} value={form.wip_screening} placeholder="none" onChange={(e) => set("wip_screening", e.target.value)} />
              </label>
              <label className="st-cap">
                <span>Interviewing</span>
                <input id="cap-interviewing" type="number" min={1} max={999} value={form.wip_interviewing} placeholder="none" onChange={(e) => set("wip_interviewing", e.target.value)} />
              </label>
            </div>
          </div>
        </section>

        <section className="card st-card">
          <SectionHead label="Notifications" />
          <p className="muted st-hint">
            Agency release notices, invitations and scorecard reminders. Email needs a mail server on
            the deployment (SMTP settings); without one, messages are logged and nothing is hidden.
          </p>
          <label className="ap-radio">
            <input type="checkbox" checked={form.email_enabled} onChange={(e) => set("email_enabled", e.target.checked)} />
            <span>Send email</span>
          </label>
          <label className="ap-radio">
            <input type="checkbox" checked={form.scorecard_reminders} onChange={(e) => set("scorecard_reminders", e.target.checked)} />
            <span>Remind interviewers about a scorecard they owe (one hour after the interview, then daily)</span>
          </label>
          <div className="st-field">
            <label htmlFor="slack">
              <span className="st-label">Slack incoming webhook</span>
            </label>
            <input id="slack" type="url" placeholder="https://hooks.slack.com/services/…" value={form.slack_webhook_url} onChange={(e) => set("slack_webhook_url", e.target.value)} />
          </div>
          <div className="st-field">
            <label htmlFor="teams">
              <span className="st-label">Microsoft Teams incoming webhook</span>
            </label>
            <input id="teams" type="url" placeholder="https://….webhook.office.com/…" value={form.teams_webhook_url} onChange={(e) => set("teams_webhook_url", e.target.value)} />
          </div>
        </section>
      </div>

      <p className="muted st-hint" style={{ marginTop: "var(--step-4)" }}>
        Colours, type and the product name are under <a href="/admin/appearance">Appearance</a>; the
        attributes every scorecard rates under <a href="/admin/attributes">Ways of working</a>.
      </p>
    </main>
  );
}
