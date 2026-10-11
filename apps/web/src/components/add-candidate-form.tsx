"use client";

import { useState } from "react";
import { api, ApiError, apiErrorMessage } from "@/lib/api";

/**
 * Add a candidate without an agency (docs/05 §8): a careers-site applicant,
 * an employee's referral, an internal move.
 *
 * The same identity matching runs as for an agency submission. When the
 * matcher is sure, the person is linked to their existing record and the
 * history comes along; when it is unsure, the server answers with who it
 * might be and this form asks, rather than guessing either way. When an
 * agency still owns the introduction, the answer is no, with the date.
 */
type Source = "careers" | "referral" | "internal";

interface Possible {
  id: string;
  displayName: string;
  reference: string | null;
  currentTitle: string | null;
  currentEmployer: string | null;
}

const SOURCES: { key: Source; label: string; hint: string; detail: string }[] = [
  { key: "careers", label: "Applied directly", hint: "Careers site, a job board, an email to the team.", detail: "Where it came in (optional)" },
  { key: "referral", label: "Referred by an employee", hint: "Someone here put their name forward.", detail: "Who referred them" },
  { key: "internal", label: "Internal move", hint: "Already works here.", detail: "Current team (optional)" },
];

export function AddCandidateForm({
  positionId,
  positionTitle,
  onDone,
}: {
  positionId: string;
  positionTitle: string;
  onDone: (applicationId: string) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [title, setTitle] = useState("");
  const [employer, setEmployer] = useState("");
  const [location, setLocation] = useState("");
  const [source, setSource] = useState<Source>("careers");
  const [detail, setDetail] = useState("");
  const [possible, setPossible] = useState<Possible | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const src = SOURCES.find((s) => s.key === source)!;

  async function send(answer?: { link_candidate_id?: string; force_new?: boolean }) {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ application_id: string; matched: boolean }>(`/positions/${positionId}/candidates`, {
        method: "POST",
        body: {
          candidate_name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          current_title: title.trim() || undefined,
          current_employer: employer.trim() || undefined,
          location: location.trim() || undefined,
          source,
          source_detail: detail.trim() || undefined,
          ...answer,
        },
      });
      onDone(r.application_id);
    } catch (e) {
      const body = e instanceof ApiError ? (e.body as { code?: string; candidate?: Possible } | null) : null;
      if (e instanceof ApiError && e.status === 409 && body?.code === "possible_match" && body.candidate) {
        setPossible(body.candidate);
      } else {
        setPossible(null);
        setError(apiErrorMessage(e));
      }
    } finally {
      setBusy(false);
    }
  }

  function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!name.trim() || !email.trim() || !phone.trim()) {
      setError("Name, email and phone are needed: they are how the same person is recognised next time.");
      return;
    }
    void send();
  }

  return (
    <form onSubmit={submit} className="acf">
      <p className="muted acf-lede">
        For <strong>{positionTitle}</strong>. No agency is involved, so no agency can claim this
        person for this role.
      </p>
      <div className="acf-grid">
        <label>
          Full name *
          <input id="acf-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} autoFocus />
        </label>
        <label>
          Email *
          <input id="acf-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Phone *
          <input id="acf-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 512 555 0100" />
        </label>
        <label>
          Current title
          <input id="acf-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
        </label>
        <label>
          Current employer
          <input id="acf-employer" value={employer} onChange={(e) => setEmployer(e.target.value)} maxLength={200} />
        </label>
        <label>
          Location
          <input id="acf-location" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={200} />
        </label>
      </div>

      <fieldset className="acf-source">
        <legend className="mono-label">How they came to us</legend>
        {SOURCES.map((s) => (
          <label key={s.key} className="ap-radio">
            <input type="radio" name="source" checked={source === s.key} onChange={() => setSource(s.key)} />
            <span>
              <strong>{s.label}.</strong> <span className="muted">{s.hint}</span>
            </span>
          </label>
        ))}
        <label>
          {src.detail}
          <input id="acf-detail" value={detail} onChange={(e) => setDetail(e.target.value)} maxLength={200} />
        </label>
      </fieldset>

      {possible && (
        <div className="leak acf-possible" style={{ borderLeftColor: "var(--warn)" }}>
          <div className="mono-label">Already on file?</div>
          <p>
            This may be <strong>{possible.displayName}</strong>
            {possible.reference && <span className="mono-label"> · {possible.reference}</span>}
            {(possible.currentTitle || possible.currentEmployer) && (
              <span className="muted">
                {" "}
                ({[possible.currentTitle, possible.currentEmployer].filter(Boolean).join(" at ")})
              </span>
            )}
            , who is already on file with a different email. Same person?
          </p>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" disabled={busy} onClick={() => send({ link_candidate_id: possible.id })}>
              Yes, same person: attach their history
            </button>
            <button type="button" className="secondary" disabled={busy} onClick={() => send({ force_new: true })}>
              No, a new person
            </button>
          </div>
        </div>
      )}

      {error && <p className="error">{error}</p>}
      {!possible && (
        <div className="row" style={{ gap: 8 }}>
          <button type="submit" disabled={busy}>
            {busy ? "Adding…" : "Add to the pipeline"}
          </button>
        </div>
      )}
      <p className="muted acf-lede">
        They land in New on the pipeline, ready to screen. If they were introduced by an agency and that
        introduction is still live, this is refused and says which agency.
      </p>
    </form>
  );
}
