# Call Review — transcript-grounded QA workspace

An evidence-based reviewer interface for a UK car-finance collections team's generated call summaries. Built as a deliberately lightweight static web app for a 90-minute exercise.

## Run locally

Requires Python 3 or another static web server (no npm or API keys).

```bash
python3 -m http.server 8080
```

Open http://localhost:8080 in a browser. Do **not** open `index.html` directly, because browsers usually block `fetch()` for local files.

## Deploy

Commit the entire repository, including `data/`. On Netlify: **Add new project → Import an existing project → GitHub**. Choose the repository, leave the **build command blank** and set the **publish directory to `.`** (repository root). Deploy and verify the public URL works without logging in.

## Prioritisation and rationale

- **Transcript-first evidence:** every turn has a unique ID; clicking turns attaches exact references to a finding. The transcript is the exercise's reference, not independent financial records.
- **Human judgement over speculative model scoring:** QA decisions are Acceptable / Needs correction / Uncertain; the app never assumes a call is flawed.
- **Actionable audit trail:** issue type, impact, rationale, evidence turn references, proposed fix, optional edited summary, per-call decision and reviewer notes.
- **Useful review workflow:** search, outcome filters, progress counts and downloadable JSON for transfer.
- **Transparent bounded hints:** only two narrow rule-based prompts (possible numeric arrears disclosure and a possible call-direction contradiction). They are prompts, not automatic verdicts.
- **Zero external dependencies:** static HTML/CSS/JS works with the provided 20-call dataset; no external inference, paid LLM calls, passwords or API keys.

## Material assumptions

1. The 20 synthetic records are the full exercise scope; no live account lookup or transcription changes.
2. The transcript is the source of truth even if it includes odd ASR-style passages; reviewers apply the provided instruction to ignore clearly irrelevant hallucinations.
3. The reviewer, not a heuristic, decides whether an omission is truly required and whether severity is meaningful.
4. Reviews may be performed by one reviewer in one browser. Browser `localStorage` is sufficient for the exercise, with JSON export for portability.
5. No candidate record comes with a gold-standard judgement; the app does not fabricate labels.
6. Call `id` plus transcript turn ID is the evidence citation format.

## Manual test checklist

- [ ] All **20** calls display, including `CALL-019`, and the original supplied summary appears intact.
- [ ] On `CALL-003` a hint warns that the summary may include the prohibited precise arrears amount of **£460**. Confirm against rules and transcript before recording a rule breach.
- [ ] On `CALL-019` check the call-direction hint. T01 shows the agent initiating the call, contrary to the summary's inbound claim. Add a contradiction finding citing T01, select Needs correction.
- [ ] On `CALL-019` check T09–T11: the customer consents to recording vulnerability; required wording is absent in the summary. Add a required-omission finding.
- [ ] On `CALL-014` check whether naming the employer breaches the entity-redaction rule.
- [ ] Review a call without marking a flaw; choose Acceptable and confirm the status sticks.
- [ ] Search, filter by status, switch calls and return; findings and notes remain.
- [ ] Invalid evidence IDs are rejected; valid IDs are stored.
- [ ] Type a corrected summary, export JSON and verify statuses, findings and proposed corrections appear.
- [ ] Refresh the page; your review remains (same browser/profile).
- [ ] Open the live Netlify link in a private window and verify data, layout and controls; check narrow/mobile screen.

## Known limitations

- No LLM-powered semantic comparison or automated adjudication. The deliberately limited hints cannot detect every contradiction, omission, privacy failure or ASR hallucination, and can generate false positives.
- `localStorage` is browser/device-specific, without team collaboration, authentication, backup or server audit history. Export is manual.
- Reviewer notes and free-text corrections are not automatically validated against all summary rules. No external account verification is attempted.
- No integrated accessibility audit or automated browser test suite within the exercise timebox.

## Next improvements

Introduce optional evidence-citing model-assisted suggestions (each verified by a reviewer), machine-readable rules/checklist mapping, immutable decision history and shared authenticated storage; run structured regression tests across known correct and incorrect summaries before adopting model-based scoring.

## Data and privacy

The exercise pack contains **fictional** customer data and no call audio. Do not put real collections information into this public demonstration. No credentials are committed or required. The original sample JSON and rules are included in `data/` unchanged.
