# Security Manual Checklist

These actions require dashboard, billing, DNS, or organization access. Do not mark them complete until verified in the relevant service.

## Supabase

- Apply `supabase/migrations/202607060001_security_hardening.sql` or rerun `supabase/schema.sql`.
- Deploy `gemini-insights` with JWT verification enabled; confirm `supabase/config.toml` is honored.
- Set Edge Function secrets:
  - `GEMINI_API_KEY`
  - `LIGAND_ALLOWED_ORIGINS` with exact production and trusted preview origins.
- Confirm only public/publishable Supabase keys are exposed to the frontend.
- Confirm no service-role or secret key is present in Vercel env vars prefixed with `VITE_`.
- Auth settings:
  - Exact Site URL.
  - Exact redirect allowlist for production, preview, and local development.
  - Email confirmation setting intentionally chosen.
  - Password minimum and strength policy.
  - Leaked-password protection if available on the plan.
  - Auth endpoint rate limits.
  - CAPTCHA/Turnstile for signup, login, and recovery if abuse appears.
  - Custom SMTP for reliable recovery/confirmation email.
  - Remove unused OAuth providers.
  - Review session duration and inactivity timeout.
  - Review Auth logs for suspicious signups/failures.
- Database:
  - Verify RLS is enabled on `public.user_data` and `public.ai_rate_limits`.
  - Confirm `anon` has no direct table grants for user data or rate limits.
  - Run `supabase test db` or the SQL in `supabase/tests/rls_user_data.test.sql`.
  - Review backups and point-in-time recovery availability for the current plan.

## Google AI / Gemini

- Migrate `GEMINI_API_KEY` to a Google AI authorization key before September 2026.
- Restrict the key to Gemini API usage where Google AI Studio supports restrictions.
- Review rate limits and billing tier.
- Create billing/spend alerts for abnormal Gemini usage.
- Review Google AI Studio key leak status and rotate if flagged.
- Confirm paid API data-use settings match Ligand's privacy notice.

## Vercel

- Set only frontend-safe vars in Vercel:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY` or publishable key.
- Mark production and preview secrets as Sensitive where available.
- Keep production and preview credentials separate where possible.
- Do not expose production secrets to untrusted preview builds.
- Confirm `vercel.json` headers are active on a deployed preview before production promotion.
- Keep Git fork protection enabled.
- Review team membership and deployment permissions.
- Enable deployment protection for staging/preview where available.
- Review custom domains and DNS ownership.
- Remove stale deployments according to retention needs.
- Review WAF, bot controls, attack mode, and rate limits appropriate to the plan.
- Create usage/cost alerts.
- Confirm environment variable changes trigger redeployment.

## GitHub

- Require MFA or passkeys for maintainers.
- Minimize collaborators and repository admins.
- Enable branch/ruleset protection on `master`/`main`.
- Require pull request review before merge.
- Require the CI workflow added in `.github/workflows/ci.yml`.
- Block force pushes and branch deletion.
- Enable secret scanning and push protection.
- Enable Dependabot alerts and security updates.
- Enable code scanning/CodeQL if available on the plan.
- Keep Actions restricted to trusted actions; this repo pins GitHub-owned actions by full commit SHA.
- Require approval for fork pull request workflows.
- Review and remove stale deploy keys, PATs, OAuth apps, and GitHub Apps.

## DNS And Domain

- Verify all production and preview domains point to intended Vercel projects.
- Remove stale DNS records.
- Use registrar MFA/domain lock where available.
- Keep domain ownership and billing contacts current.

## Monitoring And Alerts

- Alert on signup spikes, auth failure spikes, Edge Function invocation spikes, Gemini billing spikes, repeated Gemini 429/5xx, failed deployments, secret scanning hits, and database resource pressure.
- Review Supabase and Vercel logs for request IDs, status categories, and rate-limit failures without collecting personal content.
