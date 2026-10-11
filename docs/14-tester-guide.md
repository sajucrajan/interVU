# 14 — Tester's guide: a new organization, end to end

For someone testing InterVU from scratch: not the Acme demo, but an
organization you create yourself and then run a hire through. It says who
the people in the system are, what each of them can do, what to set up in
which order, and what to expect at every step. Written for a QA lead; nothing
here needs the code.

> **In the product**, this same text from section 3 onward is at `/guide`.
> Section 1 and 2 are about running the stack, so they live here only.

> **The short version.** Start the stack (§1), create your organization (§2),
> build the org in the admin screens in the order given (§3), then run the
> hiring loop with one browser window per person (§4). §5 lists what has no
> screen yet, so it does not get logged as a bug. §6 is a set of test
> charters, §7 how to report.

---

## 1. Getting an environment

The public demo (https://intervu-web-lby9.onrender.com/demo) only has the
Acme organization, and it is wiped every night, so it is no good for a test
organization you want to keep. Run your own copy instead. Two ways:

**A. Build from source** (works today; needs Docker Desktop and about ten
minutes the first time):

```bash
git clone https://github.com/sajucrajan/interVU && cd interVU
docker compose -f infra/docker-compose.yml --profile app up -d --build
```

Then create your organization (§2) and open http://localhost:3000.

**B. Published images** (once they are on Docker Hub): follow
[docs/13](13-self-hosting.md). Same result, no clone.

Either way the stack is Postgres, the API and the web app, all on your
machine. Data survives restarts. To wipe everything and start again:

```bash
docker compose -f infra/docker-compose.yml down -v     # option A
docker compose down -v                                 # option B
```

**Mail is off.** No mail server is configured, so nothing is emailed:
invitations, agency notices, scorecard reminders. Every invitation instead
shows its activation link on screen for you to copy. Treat "an email would
have gone out here" as expected.

**One window per person.** Sign-in is a cookie, so signing in as someone else
in the same window signs the first person out. Use one browser profile, or
one private window, per person you are playing. Chrome's profiles are the
least confusing way to keep five people signed in at once.

---

## 2. Creating your organization

InterVU has no public sign-up page: an organization is created by whoever
runs the server, once. Pick a name and a short slug (lowercase letters,
digits, hyphens), an admin email and a password of at least ten characters.
Any email address works; nothing is sent to it.

Option A (built from source):

```bash
docker compose -f infra/docker-compose.yml exec \
  -e ORG_NAME="Northwind Labs" -e ORG_SLUG=northwind \
  -e ADMIN_EMAIL=qa@northwind.test -e ADMIN_NAME="QA Lead" \
  -e ADMIN_PASSWORD='northwind-qa-2026' \
  api ./node_modules/.bin/tsx prisma/bootstrap.ts
```

Option B: put the same five values in `.env` and run
`docker compose --profile setup run --rm bootstrap`.

It prints what it made. You now have:

- the organization, with the default settings (an agency owns a candidate it
  introduced for 180 days, per position; scorecards stay hidden until the
  reader has filed their own);
- the five built-in roles (§3.1);
- the five default ways of working rated on every scorecard (§3.7);
- one admin, active, with the password you gave.

Open http://localhost:3000 and sign in. If yours is the only organization on
the server, the sign-in page does not ask which. If you also load the Acme
demo data later, it will ask: type the slug.

Running the same command again resets the admin's password. Running it with a
different slug adds a second organization, which is how to test that two
organizations cannot see each other.

---

## 3. Who is who

### 3.1 The five built-in roles

Every organization starts with these. An admin can change what each one
allows, and add roles of their own (§3.3).

| Role | One line | Sees in the menu | Cannot |
|---|---|---|---|
| **Organization admin** | Runs the workspace: people, structure, agencies, settings, plus everything a recruiter does. | Everything, including the Admin section. | Remove the last admin, or the admin permission from the last role that has it. |
| **Recruiter** | Runs hiring day to day: posts roles, shares them with agencies, screens what comes in, settles duplicate claims, schedules interviews, moves candidates. | Today, Pipeline, Match reviews, Question bank, Positions, Templates, Analytics, Explorer. | Record the hire or no-hire decision; manage people or agencies. |
| **Hiring manager** | Owns the outcome for their teams: screens, sits on panels, reads the debrief, records the decision. | Today, Pipeline, Question bank, Positions, Templates, Analytics, Explorer, within their scope. | Post or share a role; see other teams' candidates; settle duplicates. |
| **Project manager** | Follows hiring in their scope, read-only: where things stand, how long they take. | Today (as "where hiring stands"), Pipeline, Positions, Analytics, Explorer. | Change anything. Typing a URL they are not offered (say `/match-reviews`) gets a page saying whose job it is. |
| **Interviewer** | Interviews and files a scorecard after each round. Being on a panel is the permission. | Today, My interviews, Question bank. | See Positions or the Pipeline. They open only the candidates they are interviewing, until a decision is recorded. |

### 3.2 Scope

A role is granted **at a place in the org chart**: the whole organization, or
one vertical, unit or team. A grant at a unit covers every team under it,
including teams added later. The same person can hold several grants; they
add up. So "hiring manager for Engineering" and "project manager for Sales"
on one person is normal.

### 3.3 Custom roles

Admin → **Roles** → *Create a role*: a name, a description and a tick list of
permissions. Example to test with: a *Vendor manager* who can view positions,
view submissions and view agency performance, and nothing else. Grant it
like any other role.

### 3.4 The agency side

Agencies (vendors) never enter the organization workspace. They have their
own door, the **vendor portal** at `/vendor/login`, and their own people:

| | |
|---|---|
| **Vendor admin** | The first person on an agency's contract. Can invite other recruiters at the same agency. |
| **Vendor recruiter** | Sees the roles released to their agency, submits candidates, sees what happened to them in coarse terms. |

Nothing in the portal names interviewers, shows ratings or notes, shows
other agencies, or shows internal stages. That blindness is a feature; test
that it holds.

### 3.5 Personas: one person, two jobs

A person who is a hiring manager **and** sits on an interview panel is doing
two jobs with different screens. InterVU treats these as **personas**. After
sign-in, such a person is asked *"How are you working today?"* and picks one;
the choice can be remembered or asked every time. They switch from the
account menu (the ⋯ at the bottom of the left rail) and land on Today, since
the page they were on belonged to the other job; a refused page offers *Try
as …*, which switches and comes straight back to it. Only the active persona's
permissions apply: a hiring manager who opens an interview room link is told
*"Switch to Interviewer and continue"* instead of being let in. Today shows a
count of anything waiting in the other persona.

Everyone else holds one persona and is never asked.

---

## 4. Setting the organization up, in order

Do these as the admin, in this order: each one depends on the one before.

### Step 1 · Teams

Admin → **Teams** → *Add a vertical*. Two kinds: a **unit** holds other units
and teams; a **team** holds positions. Build at least two branches so scope
has something to bite on:

```
Engineering (unit)
  Platform (team)
  Data (team)
Sales (unit)
  Sales Ops (team)
```

Positions always belong to a team. Scope grants can point at any node.

### Step 2 · People

Admin → **People & access** → *Invite someone*: full name, work email, a role
and a scope (the whole organization or one node). *Grant another role* adds a
second grant to the same person. After you invite, an **Activation link** box
appears: copy it, open it in that person's own browser window, set a password.
Until then the row says *awaiting activation*.

A cast that exercises everything:

| Person | Role | Scope |
|---|---|---|
| Riley Recruiter | Recruiter | Organization |
| Morgan Manager | Hiring manager | Engineering |
| Pat Project | Project manager | Sales |
| Ira Interviewer | Interviewer | Organization |
| Ivo Interviewer | Interviewer | Organization |

Morgan will later be put on a panel too, which gives them the second persona.

### Step 3 · Agencies

Admin → **Vendors** → *Add a vendor*: agency name, **tier** (1 is the most
preferred; a tiered release opens a role to tier 1 first), contract status
and dates, and the first person at the agency (full name, email). You get an
activation link for that person; open it in a separate window, set a
password. Make two agencies: *Bridge Talent* (tier 1) and *Second Street
Staffing* (tier 2). Agency people sign in at `/vendor/login` with the
organization slug, email and password.

### Step 4 · A job description template (optional)

**Templates** → *New template*: a reusable job description. Positions can
start from one. Skip it the first time; come back when you want to test
"start from a template" on the new-position form.

### Step 5 · The first position

**Positions** → *New position*. The form, top to bottom:

- **Role**: title, team (required), seniority, employment type, location
  policy and location, openings, minimum total experience, description,
  other must-haves (free text, one per line).
- **Skill matrix**: add each skill with its importance (must-have or nice to
  have), proficiency and minimum years. This is the first time the
  organization has any skills at all: the question bank, panel suggestions
  and scorecards all key off this list.
- **Sourcing channel**: *Vendors only*, *Hybrid* (direct first, agencies
  later) or *Direct only* (never shared with agencies).
- **Vendor terms**: the rate band agencies will see, and *Vendors join on*
  for a tiered release (days between tier 1 and the rest).
- **Publish** with one of: release to all agencies now; tier 1 now, tier 2
  after N days; release to agencies by hand. Or *Save as draft*.

Make two: *Senior Platform Engineer* (Platform team, vendors only, tier 1
now and the rest after 7 days) and *Sales Operations Analyst* (Sales Ops
team, release by hand).

### Step 6 · Sharing a role

Open the position. The right-hand card, **Who can see this role**, is the
whole story in one place: a one-line summary, *Who can send candidates?*
(agencies, both, only us), and a row per agency saying whether and since
when they can see it. *Share with agencies…* ticks several at once. The ⋯
menu also has *Publish…*, *Pause (hide from agencies)*, *Reopen* and *Edit
details*. Share the Sales role with Second Street only, and check Bridge
Talent's portal does not show it.

### Step 7 · The question bank

**Question bank** → add a question: the prompt, its kind (technical, system
design, behavioural, situational), a level 1–5, the competencies it probes
(from the skills your positions defined), what a strong answer usually
covers, follow-ups if the answer is thin. Any org user can add one,
interviewers included. Add three or four against the Platform role's skills;
they will appear in the interview room for that role.

### Step 8 · Ways of working

Admin → **Ways of working**. Five defaults (Communication, Collaboration,
Ownership, Curiosity, Values alignment), each with a one-line meaning and
the behaviours that show it. Edit one, reorder with the arrows, retire one,
bring it back, add a sixth. These are rated on every scorecard whatever the
role.

### Step 9 · Appearance

Admin → **Appearance**. Pick one of the 19 palettes (light ones first, then
the six dark-by-default ones), change any colour in it for the light or the
dark set, choose a type family, give the product your name. The strip on
the right shows eight of the main screens in the draft, light or dark,
browsed with the arrows. *Save for everyone* applies it to the workspace,
the vendor portal and (on a single-organization server) the sign-in page.
Status colours stay fixed: check that a red accent never makes a healthy row
look broken.

That is the organization. Everything from here is the hiring loop.

---

## 5. Running a hire, person by person

Keep one window per person. The sequence below is one complete loop; run it
once straight through before you start breaking things.

### 5.1 The agency sends candidates

Sign in at `/vendor/login` as Bridge Talent. The portal lists only the roles
released to this agency, with the rate band. Open the Platform role →
**Submit a candidate**: name, email, phone (required), current employer and
title, notes, a resume (PDF, TXT or DOCX, up to 10 MB), and a consent tick.

Submit three people. Then, as Second Street, submit **one of the same three
again** with the same email: the portal refuses with *already in process from
another source* and nothing more. That is the ownership rule: the first valid
submission owns the candidate, and the second agency is told nothing about
who.

**My submissions** on the portal shows each person with a coarse status
(submitted, interviewing, offered, not selected). It never gets more specific
than that.

### 5.2 The recruiter screens

Sign in as Riley. **Today** says how many things are waiting: new
submissions to screen, duplicate contests, SLA breaches. **Pipeline** is the
board: New → Screening → Interviewing → Offer, every card with a next-step
button and a ⋯ menu (move stage, schedule interview, screen, open debrief,
record offer or rejection, candidate history). Click several cards to move
them together.

*Screen* opens the screening page: what the role needs against what the CV
shows, must-haves with no evidence, whether this person was considered
before by any team, and *Your call*: move them on into the loop, or *Reject at screening* with a
reason. Rejections here are recorded as screening rejections, separate from
panel rejections, and the button disappears once anyone has interviewed them.

### 5.3 Match reviews: is this the same person?

Exact matches on email or phone link automatically. A submission the matcher
is unsure about (same-looking name, different email, similar employer)
lands in **Match reviews** with the evidence side by side: *Same person —
link* merges it into the existing candidate's history; *Keep separate*
creates a new candidate and teaches the matcher not to ask again. To produce
one: submit "Katherine Walsh" at one agency, then "Catherine Walsh" at the
other with a different email and the same employer.

### 5.4 Scheduling the interview

On a card: *Schedule interview…*: round name, when, and the panel. Suggested
panelists are skill-matched to the role; cmd/ctrl-click picks several. Put **Ira and Morgan** on the first round: Ira is an
interviewer; Morgan is the hiring manager, and this seat is what gives
Morgan a second persona.

### 5.5 The interviewer files a scorecard

Sign in as Ira. **My interviews** is grouped by what you must do: *Waiting
on you*, *Upcoming*, *Filed*. An interview that has not happened is never
counted as owed. *Prepare* opens the **interview room**: the requirements
with whether the CV shows them, the bank's questions for this round (tick
the ones you ask), the resume, and on the right the scorecard: a rating and
a note per competency (blank means *not assessed*, which the debrief shows
differently from a low score), then **How they'd work here**, then your call
and overall. Notes autosave.

Rate Collaboration **5** and try to file: it refuses until you say what you
saw. That rule is enforced by the server as well. *Quick file* on the list
is the same scorecard without the room.

After filing, *View scorecards* shows yours, then the rest of the panel's,
which stay hidden until yours is in.

### 5.6 The hiring manager with two personas

Sign in as Morgan. The sign-in now asks *Hiring manager or Interviewer?*.
Pick Hiring manager: Today shows "1 thing waiting as Interviewer". Open the
account menu (⋯ bottom left) to switch, set a default, or ask every time.
Paste the interview room URL while still Hiring manager: the page offers
*Switch to Interviewer and continue*. Switch, file the scorecard, switch back.

### 5.7 The debrief and the decision

As Morgan (Hiring manager), Pipeline → the card → *Decide*. The **debrief**
stays sealed until every panelist has filed. Then: recommendations, the
competency matrix with a consensus column and a wash on any row where the
panel is split by 2 or more, the **How they'd work here** matrix with both
sides' notes under a split row, the scorecards themselves, and on the right
**Feedback to vendor**: tick what leaves the building (outcome and summary,
strengths and gaps as tags, a "would consider for" hint, round by round
off by default), auto-draft the summary, and preview *What the vendor will
see*. Then *Record decision & release feedback* or *Record decision, hold
feedback*. The ⋯ menu on the card also has one-click *Record offer* and
*Record rejection* without feedback.

### 5.8 The agency sees the outcome

Back in Bridge Talent's portal, *My submissions* now shows the new status
and, if released, the feedback packet: the summary, the tags, the hint.
Never a name, a number, a note or who disagreed. The portal's
**Performance** page shows the agency its own funnel against the other
agencies, anonymised.

### 5.9 Candidate history

Any candidate's page (from a card's *Candidate history*, or ⌘K / Ctrl-K to
jump to a candidate, role, vendor or action) shows the timeline across every team and agency, every application, source
history, merged identities and identity confidence, and any flags. Morgan
sees only Engineering's; an interviewer sees the people they are
interviewing until the decision; Pat sees Sales.

### 5.10 Analytics

**Analytics** (anyone who can view positions): time to offer, funnel,
channels. **Vendor performance** (admin, or the custom vendor-manager role):
which agencies are worth the fee, side by side. **Explorer**: the org chart
as a sunburst down to positions.

---

## 6. Things that have no screen yet

Logging these as bugs would be fair but unhelpful; they are known gaps.

- **No direct candidate entry.** Candidates arrive only through an agency's
  portal. A *Direct only* position has no way to receive a candidate from
  the web app; that path exists in the API only.
- **Organization settings** (hidden-until-submitted versus open scorecards,
  the ownership window, branding) have no admin screen. Defaults apply.
- **Offer details** (amount, start date, decline reasons) exist in the API;
  the board has one-click *Record offer* only.
- **Do-not-hire flags** are shown on the candidate page but cannot be set
  from it.
- **GDPR erasure** is API only.
- **No single sign-on**; accounts are email and password by invitation.
- **No email** unless a mail server is configured. Activation links are shown
  on screen instead.

---

## 7. Test charters

Each is an afternoon. The expected behaviour is the rule to break.

| Charter | The rule under test |
|---|---|
| **Scope walls** | Pat (Sales, read-only) never sees an Engineering position, candidate or debrief, by menu or by URL. Morgan never sees Sales. Typed URLs get the "not available to your role" page, never a blank or an error. |
| **Two organizations** | Bootstrap a second org. Nothing of one is reachable from the other: not by URL, not by id, not in any list, not through an agency that works for both. |
| **Agency blindness** | No page in the vendor portal, and nothing it fetches, names an interviewer, another agency, a rating, a note, an internal stage or a decision reason. |
| **Ownership** | Second agency, same email: refused with the generic message. Same agency, same person, same role: no duplicate. Same person, a different role: a new application on the same candidate. After 180 days (edit the submission date in the database if you want to test it) the claim lapses. |
| **Identity** | gmail dots and plus-tags match the same person. Phone formats match. Name spelling variants and family-name order land in Match reviews, not auto-linked, not silently separate. Link and keep-separate are both reversible from the candidate page. |
| **Scorecard policy** | Nobody reads a colleague's scorecard before filing their own: list, room, debrief, candidate timeline, and the API behind each. The debrief stays sealed until the last panelist files. A revised scorecard replaces, never duplicates. |
| **Evidence rule** | A 1 or a 5 on a way of working cannot be filed without a note, in the room, the quick-file form, and by posting to the API directly. |
| **Personas** | A person on a panel and holding a role is asked at sign-in; "ask every time" is honoured; the switch is one click; a deep link into the wrong persona offers the switch and never a 403; nothing from the inactive persona is reachable; Today counts the other persona's work correctly. |
| **Pipeline** | Moving one card or several keeps them visible under any filter; SLA ages advance; the board, Today and the position's *View candidates* agree on counts. |
| **Admin guards** | The last admin cannot be disabled or demoted; the admin permission cannot be removed from the last role that has it; an invitation link works once and expires; a disabled person cannot sign in. |
| **Appearance** | Every palette, light and dark, on every screen in the preview and then for real: text stays readable, status colours stay green/amber/red whatever the accent, the rail's own text is legible on its own background, the vendor portal and sign-in follow, and a person's own light/dark switch still wins. |
| **Small screens** | Every page at phone width: no sideways scroll, every action reachable. |
| **Resilience** | Refresh mid-form (room notes survive; others reset cleanly). Browser back after every action. Two recruiters moving the same card at once. |

---

## 8. Reporting

Open an issue at https://github.com/sajucrajan/interVU/issues/new/choose and
pick **Bug**. Say who you were (role, scope, persona), what organization,
the exact steps, what you expected, what happened, and a screenshot. If it
is a design question rather than a defect ("should a recruiter be able to
…?"), there is a *Design question* template for exactly that; those are
wanted as much as bugs.

The Acme demo data is a useful reference for what a healthy, populated
organization looks like: `docker compose -f infra/docker-compose.yml exec
api ./node_modules/.bin/tsx prisma/seed.ts` loads it alongside yours
(password `intervu-demo` for every account, accounts listed in
[docs/10](10-demo-accounts.md)).
