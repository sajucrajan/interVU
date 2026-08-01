export type SlaState = "ok" | "aging" | "breached";

export interface WorkGroup {
  key: string;
  label: string;
  /** One line of context, so the row explains itself without being opened. */
  sub: string;
  count: number;
  href: string;
  tone: "critical" | "warning" | "normal";
  /** When the oldest item in this group started waiting. */
  oldest_at: string | null;
  sla_state: SlaState | null;
  sla_label: string | null;
}

export interface StageHealth {
  stage: string;
  count: number;
  healthy: number;
  aging: number;
  breached: number;
  /** Median dwell in the stage, in hours. */
  median_hours: number | null;
  sla_hours: number;
}

export interface Worklist {
  user: { name: string; roles: string[] };
  total: number;
  head_stats: {
    in_flight: number;
    in_flight_delta: number;
    /** Offer acceptance is not modelled yet, so this is time to OFFER. */
    median_time_to_offer_days: number | null;
    median_time_to_offer_delta: number | null;
    sla_breached: number;
    sla_breached_delta: number;
  };
  groups: WorkGroup[];
  pipeline: StageHealth[];
  upcoming_interviews: {
    id: string;
    round_name: string;
    scheduled_at: string;
    candidate: { id: string; displayName: string };
    position_title: string;
    my_scorecard_submitted: boolean;
    prep: string;
    prep_tone: "ok" | "warn";
  }[];
  recent_submissions: {
    id: string;
    candidate: { id: string; displayName: string; title: string } | null;
    position_title: string;
    position_reference: string | null;
    vendor: string;
    status: string;
    ownership_status: string;
    received_at: string;
    /** Present when the matching engine scored this submission. */
    match_score: number | null;
  }[];
  sla: Record<string, number>;
}
