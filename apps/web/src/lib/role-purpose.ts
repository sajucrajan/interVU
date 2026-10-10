/**
 * One line on what this person is here to do, chosen from what they can
 * actually do rather than from a role name — roles are organization-defined
 * (docs/09 §2), so "Vendor manager" may mean anything, but holding only
 * vendors.view_performance means exactly one thing.
 *
 * Ordered from the broadest grant down: the first match describes the job.
 */
export function rolePurpose(caps: readonly string[], onPanels: boolean): string {
  const has = (p: string) => caps.includes(p);
  if (has("org.manage_users"))
    return "You run this workspace — people and access, vendors and settings — as well as everything a recruiter does.";
  if (has("positions.create"))
    return "You run hiring day to day: screen what agencies send, settle duplicate claims, and move candidates through the loop.";
  if (has("decisions.record"))
    return "You own the outcome for your teams: screen candidates, sit on panels, and record hire or no-hire.";
  if (has("vendors.manage") || has("vendors.view_performance"))
    return "You review how each agency performs. You can read positions and the pipeline in your scope; nothing here needs your action.";
  if (has("submissions.view") || has("positions.view"))
    return "You follow hiring in your scope. You can read positions and the pipeline; nothing here needs your action.";
  if (onPanels || has("scorecards.submit"))
    return "You interview candidates and file a scorecard after each round. Everything you need is under My interviews.";
  return "Your role doesn't include any hiring work yet. If that's wrong, ask an admin.";
}
