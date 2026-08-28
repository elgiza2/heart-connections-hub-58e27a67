# Replace the APIs catalog with 1,000 real integrations

## What will change
- Remove the old hand-written API catalog from the visible **APIs** tab.
- Use exactly 1,000 integrations backed by maintained Pipedream components from GitHub.
- Rank common business apps first, then use component/action coverage as the objective ranking signal for the long tail.
- Remove duplicate, test, sandbox, deprecated, and version-duplicate entries.
- Keep search responsive and paginate the rendered rows.

## Verification
- Sign in with the provided test account using the existing authenticated session.
- Open Integrations → APIs and confirm the catalog count and first-ranked apps.
- Search for major apps such as Slack, Google Sheets, Salesforce, Stripe, Shopify, and GitHub.
- Check browser errors and the project build signal.

## Technical details
- Reuse the existing Pipedream connect flow so every listed app has maintained actions/triggers rather than a decorative API entry.
- Make the generated catalog the single source for this tab; the legacy manually curated API-key list will no longer be rendered there.
- Preserve custom API keys under the existing **Custom** tab.
