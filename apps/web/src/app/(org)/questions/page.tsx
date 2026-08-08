"use client";

import { useCallback, useEffect, useState } from "react";
import { api, apiErrorMessage } from "@/lib/api";
import { SectionHead } from "@/components/section-head";
import { VoteButtons } from "@/components/vote";

interface Question {
  id: string;
  prompt: string;
  rubric: string[];
  follow_ups: string[];
  kind: string;
  level: number;
  created_by: string | null;
  skills: { id: string; name: string }[];
  times_asked: number;
  discrimination: number | null;
  signal_basis: string;
  score: number;
  up: number;
  down: number;
  my_vote: number;
}

interface Skill {
  id: string;
  name: string;
}

const KINDS = [
  { key: "technical", label: "Technical" },
  { key: "system_design", label: "System design" },
  { key: "behavioural", label: "Behavioural" },
  { key: "situational", label: "Situational" },
];

const lines = (s: string) =>
  s
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);

/**
 * The shared question bank.
 *
 * Questions are tagged to SKILLS rather than positions, which is what makes
 * the bank compound: one written for a platform role surfaces on every other
 * role needing the same competency, instead of being copied per requisition
 * and drifting.
 *
 * The discrimination column is the reason to keep score. A question everyone
 * answers the same way is costing interview time without buying information;
 * one with a wide spread of ratings is doing real work. Below four rated
 * answers it says what it still needs rather than ranking on noise.
 */
export default function QuestionsPage() {
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [skillId, setSkillId] = useState("");
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    const qs = new URLSearchParams();
    if (skillId) qs.set("skill_id", skillId);
    if (q) qs.set("q", q);
    api<Question[]>(`/questions?${qs}`)
      .then(setQuestions)
      .catch((e) => setError(apiErrorMessage(e)));
  }, [skillId, q]);

  useEffect(() => {
    api<Skill[]>("/questions/skills")
      .then(setSkills)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const t = setTimeout(refresh, 250);
    return () => clearTimeout(t);
  }, [refresh]);

  return (
    <main className="wide">
      <header className="page-head">
        <div>
          <div className="mono-label">Shared across every panel</div>
          <h1 style={{ marginTop: 12 }}>Question bank</h1>
          <p className="dossier-meta" style={{ maxWidth: "64ch" }}>
            Tagged to competencies, not to roles — a question written once
            surfaces on every position that grades the same skill. Anyone who
            interviews can add one.
          </p>
        </div>
        <button type="button" onClick={() => setAdding((v) => !v)}>
          {adding ? "Close" : "Add a question"}
        </button>
      </header>

      {adding && (
        <QuestionForm
          skills={skills}
          onDone={() => {
            setAdding(false);
            refresh();
          }}
        />
      )}

      <div className="row qb-filters">
        <input
          placeholder="Search prompts…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ flex: 1, minWidth: 220 }}
        />
        <select value={skillId} onChange={(e) => setSkillId(e.target.value)}>
          <option value="">All competencies</option>
          {skills.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="error">{error}</p>}
      {!questions ? (
        <p className="muted">Loading…</p>
      ) : questions.length === 0 ? (
        <p className="muted">
          Nothing here yet. The bank is only as good as what the panel puts in
          it.
        </p>
      ) : (
        <>
          <SectionHead label={`${questions.length} questions`} />
          {questions.map((item) => (
            <div key={item.id} className="qb-row">
              <div className="qb-main">
                <p className="qb-prompt">{item.prompt}</p>
                <div className="row qb-tags">
                  {item.skills.map((s) => (
                    <span key={s.id} className="skill-chip">
                      {s.name}
                    </span>
                  ))}
                  <span className="mono-label">
                    L{item.level} · {item.kind.replace("_", " ")}
                    {item.created_by ? ` · ${item.created_by}` : ""}
                  </span>
                </div>
                {item.rubric.length > 0 && (
                  <details className="qb-details">
                    <summary>A strong answer usually covers</summary>
                    <ul>
                      {item.rubric.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                    {item.follow_ups.length > 0 && (
                      <>
                        <div className="mono-label">If the answer is thin</div>
                        <ul>
                          {item.follow_ups.map((f, i) => (
                            <li key={i}>{f}</li>
                          ))}
                        </ul>
                      </>
                    )}
                  </details>
                )}
              </div>
              <VoteButtons
                questionId={item.id}
                initial={{
                  score: item.score,
                  up: item.up,
                  down: item.down,
                  my_vote: item.my_vote,
                }}
              />
              <div className="qb-signal">
                <div className="figure">
                  {item.discrimination !== null ? item.discrimination : "—"}
                </div>
                <div className="mono-label">spread</div>
                <div className="basis">{item.signal_basis}</div>
              </div>
            </div>
          ))}
          <p className="muted qb-note">
            <strong>Spread</strong> is the range of competency ratings that
            followed this question — high means it separates people, 0 means
            everyone lands in the same place and it is buying no information.
            <strong> Votes</strong> are the panel&rsquo;s judgement, which is a
            different thing: spread cannot tell you a question is unfair,
            exhausting or badly worded, and people can.
          </p>
        </>
      )}
    </main>
  );
}

function QuestionForm({
  skills,
  onDone,
}: {
  skills: Skill[];
  onDone: () => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [rubric, setRubric] = useState("");
  const [followUps, setFollowUps] = useState("");
  const [kind, setKind] = useState("technical");
  const [level, setLevel] = useState(3);
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/questions", {
        method: "POST",
        body: {
          prompt,
          rubric: lines(rubric),
          follow_ups: lines(followUps),
          kind,
          level,
          skill_ids: picked,
        },
      });
      onDone();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="qb-form">
      <label>Question</label>
      <textarea
        rows={2}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Walk me through how you would…"
      />

      <label>Competencies it probes *</label>
      <div className="row qb-picker">
        {skills.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`skill-chip${picked.includes(s.id) ? " must" : ""}`}
            onClick={() =>
              setPicked((prev) =>
                prev.includes(s.id)
                  ? prev.filter((x) => x !== s.id)
                  : [...prev, s.id],
              )
            }
          >
            {s.name}
          </button>
        ))}
      </div>

      <div className="row">
        <div style={{ minWidth: 180 }}>
          <label>Kind</label>
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            {KINDS.map((k) => (
              <option key={k.key} value={k.key}>
                {k.label}
              </option>
            ))}
          </select>
        </div>
        <div style={{ width: 120 }}>
          <label>Level (1–5)</label>
          <input
            type="number"
            min={1}
            max={5}
            value={level}
            onChange={(e) => setLevel(Number(e.target.value))}
          />
        </div>
      </div>

      <label>What a strong answer usually covers — one per line</label>
      <textarea
        rows={3}
        value={rubric}
        onChange={(e) => setRubric(e.target.value)}
        placeholder={"Names the tradeoff explicitly\nReasons about failure, not just the happy path"}
      />
      <p className="muted qb-caution">
        Guidance, not a mark scheme. A checklist people grade against produces
        consistent scores and worse hiring.
      </p>

      <label>Follow-ups if the answer is thin — one per line</label>
      <textarea
        rows={2}
        value={followUps}
        onChange={(e) => setFollowUps(e.target.value)}
      />

      {error && <p className="error">{error}</p>}
      <button disabled={busy || picked.length === 0 || prompt.trim().length < 8}>
        {busy ? "Adding…" : "Add to the bank"}
      </button>
    </form>
  );
}
