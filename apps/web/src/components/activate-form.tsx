"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, apiErrorMessage } from "@/lib/api";

interface Invite {
  email: string;
  name: string;
  kind: "org" | "vendor";
  organization: { name: string; slug: string };
}

/** Mirrors the server-side minimum in ActivateAccount. */
const MIN_LENGTH = 12;

export function ActivateForm() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") ?? "";

  const [invite, setInvite] = useState<Invite | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setLoadError("This link is missing its invitation code.");
      return;
    }
    api<Invite>(`/auth/invite/${encodeURIComponent(token)}`)
      .then(setInvite)
      .catch((e) => setLoadError(apiErrorMessage(e)));
  }, [token]);

  if (loadError) {
    return (
      <>
        <p className="error">{loadError}</p>
        <p className="muted">
          Ask whoever invited you to send a fresh link — invitations expire
          after seven days and can only be used once.
        </p>
      </>
    );
  }
  if (!invite) return <p className="muted">Checking your invitation…</p>;

  const tooShort = password.length > 0 && password.length < MIN_LENGTH;
  const mismatch = confirm.length > 0 && password !== confirm;
  const ready = password.length >= MIN_LENGTH && password === confirm && !busy;

  return (
    <>
      <p className="muted" style={{ marginTop: 0 }}>
        Welcome, {invite.name} — you&apos;re joining{" "}
        <strong>{invite.organization.name}</strong> as {invite.email}.
      </p>

      <label>New password</label>
      <input
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <label>Confirm password</label>
      <input
        type="password"
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && ready) void submit();
        }}
      />
      <p className="muted" style={{ fontSize: "0.85rem" }}>
        {tooShort
          ? `At least ${MIN_LENGTH} characters.`
          : mismatch
            ? "The two passwords don't match."
            : `Use at least ${MIN_LENGTH} characters.`}
      </p>

      <button disabled={!ready} onClick={() => void submit()}>
        {busy ? "Setting…" : "Set password and continue"}
      </button>
      {error && <p className="error">{error}</p>}
    </>
  );

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ kind: string; email: string; org_slug: string }>(
        "/auth/activate",
        { method: "POST", body: { token, password } },
      );
      // Straight to the matching sign-in form, prefilled — the org slug is what
      // the vendor portal needs and what a picker-mode org login expects.
      const q = new URLSearchParams({ org: res.org_slug, email: res.email });
      router.push(
        res.kind === "vendor" ? `/vendor/login?${q}` : `/login?${q}`,
      );
    } catch (e) {
      setError(apiErrorMessage(e));
      setBusy(false);
    }
  }
}
