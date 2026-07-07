# Security Operations

## Environment And Secret Inventory

Frontend Vercel variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Supabase Edge Function secrets/config:

- `GEMINI_API_KEY`
- `LIGAND_ALLOWED_ORIGINS`
- `SUPABASE_URL` (platform-provided)
- `SUPABASE_ANON_KEY` or `SUPABASE_PUBLISHABLE_KEY` (platform-provided/configured)

No service-role key is required by Ligand's frontend or `gemini-insights` function.

## Key Rotation Procedure

1. Create the replacement key in the provider dashboard.
2. Add it to the target environment without deleting the old key yet.
3. Redeploy/restart the affected function or app.
4. Verify sign-in, sync, and AI import/insight paths with test data.
5. Revoke the old key.
6. Run `npm run build` and `npm run security:scan`.
7. Record the rotation date and affected variable name only.

## Suspected Secret Exposure

1. Do not paste the secret into issues, chat, logs, or commits.
2. Identify the secret type and affected location.
3. Rotate the key immediately in the provider dashboard.
4. Search tracked files, build output, and recent logs for redacted evidence.
5. Run `npm run security:scan`.
6. If the secret was committed, treat Git history as exposed and rotate even if the commit is later removed.
7. Review provider logs for abuse from the exposure window.

## RLS Regression Procedure

1. Stop deploying new database changes.
2. Run `supabase/tests/rls_user_data.test.sql` in a safe local Supabase database.
3. Confirm user A cannot read, update, transfer, or delete user B data.
4. Confirm anonymous users have no direct access.
5. Confirm `ai_rate_limits` direct grants remain revoked.
6. Apply a corrective migration; do not edit production data manually unless needed for containment.
7. Re-run app smoke tests for login, cloud sync, tasks, goals, journals, workouts, and AI.

## Incident Containment Sequence

1. Preserve evidence without exposing personal content or secrets.
2. Disable the affected Edge Function or feature flag if abuse is active.
3. Rotate exposed keys.
4. Revoke suspicious sessions in Supabase Auth if account takeover is suspected.
5. Apply a minimal fix.
6. Verify with targeted tests.
7. Restore service.
8. Write a post-incident note with cause, impact, fix, and follow-up controls.

## AI Cost Abuse Response

1. Check Supabase Edge Function invocation counts and Google AI usage.
2. Confirm `consume_ai_rate_limit` is deployed and being called.
3. Lower per-action limits in `supabase/functions/gemini-insights/security.js` if needed.
4. Temporarily unset or rotate `GEMINI_API_KEY` if spending is uncontrolled.
5. Review CORS `LIGAND_ALLOWED_ORIGINS`.
6. Add provider billing caps or alerts.

## Account Takeover Response

1. Help the affected user reset their password.
2. Revoke active sessions in Supabase Auth where available.
3. Review Auth logs for suspicious IPs, repeated failures, or email changes.
4. Confirm password and recovery settings are hardened.
5. Encourage passkeys/MFA if added later.
6. Do not disclose whether an email exists to third parties.

## Backup And Restoration Checklist

1. Confirm Supabase backup/PITR availability for the current plan.
2. Periodically export schema and run local restore tests with non-production data.
3. Test `user_data` restoration in an isolated project.
4. Verify RLS policies after restore.
5. Verify account deletion cascade behavior after restore.
6. Document restore time and any missing dashboard settings.

## Logging And Retention Rules

Allowed operational fields:

- Timestamp
- Request ID
- Endpoint/action
- Status category
- Duration
- Rate-limit result
- Provider status category
- Model name
- Approximate size/count buckets

Never log:

- Passwords
- Access/refresh tokens
- Authorization headers
- Cookies
- API keys
- Journal text
- Task or goal content
- Recovery journal content
- Complete AI prompts
- Complete AI responses
- Raw OAuth responses
- Full request bodies

## Production Verification Checklist

1. `npm test`
2. `npm run security:headers`
3. `npm run build`
4. `npm run security:scan`
5. `npm audit --audit-level=high`
6. Deploy preview.
7. Verify headers on preview.
8. Sign in with a test account.
9. Create/edit tasks, goals, habits, journal entries, notes, Pomodoro settings, workouts, and settings.
10. Verify cloud sync across reload.
11. Verify AI insight and workout import.
12. Verify rate-limit behavior with test calls.
13. Verify sign-out clears local synced data.

## Responsible Disclosure Handling

1. Acknowledge within 7 days.
2. Keep details private until a fix is available.
3. Reproduce only with test data.
4. Assign severity based on exploitability and impact.
5. Patch, test, and release.
6. Credit the reporter if they want credit.

## Rollback Procedure

1. Prefer rolling back the frontend deployment first if the issue is UI-only.
2. For Edge Function issues, redeploy the previous known-good function or temporarily disable the AI feature by unsetting `GEMINI_API_KEY`.
3. For database issues, apply a forward corrective migration rather than destructive rollback.
4. Never run destructive production SQL without a backup and owner approval.
5. After rollback, run RLS and app smoke tests.
