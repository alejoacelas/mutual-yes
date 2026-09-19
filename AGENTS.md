---
agent_context:
  version: 1
  groups:
  - once
  visibility: public
---
<!-- agent-context:begin sha256=c9028887b1d8442f7c5b08b8aef9d2fc72f5dc14cc0bb704501be77757ff182b -->
<!-- shared group: once -->
# One-off projects

- Name each folder `YYYY-MM-project-name`; separate words with dashes.
- Give every one-off its own Git repository and GitHub remote when creating it.
- Make it public unless it contains employer information, others' private information, or credentials.
- Give its `AGENTS.md` one to three sentences stating its scope or goal and declare the `once` group.
- Keep instructions in `AGENTS.md`; do not create a duplicate `CLAUDE.md` unless an older or restricted Claude runtime needs an import shim.
- When finished, suggest a durable home using `~/best/projects/AGENTS.md`: maintained tools, reference material, personal or work folders, or the shared archive.
- Park unfinished or insubstantial work in its project topic's `archive/`. Record the old path and reason in that archive's `REPLICATE.md`.
<!-- agent-context:end -->


Build a minimal two-person mutual-yes page with client-side secure computation, a relay, and a self-contained HTML download. Keep personal information out of the app and repository; state privacy limits accurately.

<!-- stripe-projects-cli managed:agents-md:start -->
## Stripe Projects CLI

This repository is initialized for the Stripe project "2026-09-mutual-yes".

## Tools used

- [Stripe CLI](https://docs.stripe.com/stripe-cli) with the `projects` plugin to manage third-party services, credentials, and deployments for this project. Use the stripe-projects-cli to manage deploying and access to third party services.
<!-- stripe-projects-cli managed:agents-md:end -->
