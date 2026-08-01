export interface WorkGroup {
  key: string;
  label: string;
  count: number;
  href: string;
  tone: "critical" | "warning" | "normal";
}

export interface Worklist {
  user: { name: string; roles: string[] };
  total: number;
  groups: WorkGroup[];
  pipeline: { stage: string; count: number }[];
  upcoming_interviews: {
    id: string;
    round_name: string;
    scheduled_at: string;
    candidate: { id: string; displayName: string };
    position_title: string;
    my_scorecard_submitted: boolean;
  }[];
  recent_submissions: {
    id: string;
    candidate: { id: string; displayName: string } | null;
    position_title: string;
    vendor: string;
    status: string;
    ownership_status: string;
    received_at: string;
  }[];
}
