// The simulation banner: what is simulated, and what is and is not sourced. Shown on every page later (rule 2) and returned by /api/info.
export const BANNER = 'SIMULATED. External inspectors run as lab stubs with deterministic rules on a lab clock: no Google Cloud Model Armor, no Azure AI Content Safety, no Amazon Bedrock Guardrails, '
  + 'no gateway, no LLM provider and no network call. The stub rules say nothing about how any real inspector detects anything. '
  + 'Only what the 2026-11-21 release notes say is sourced: one external inspector per key (Model Armor in AI Guard) and the authority cap that holds it advisory. '
  + 'Everything else (the filter names, fail-open or fail-closed, the timeout, what a client receives) is UNVERIFIED: this lab\'s own model.';

export const NOT_REAL = 'Real mode is not built. It is owner-run and read-only, needs a tenant running the 2026-11-21 release and a Google Cloud project, and comes after Mock; until then this lab is Mock only.';
