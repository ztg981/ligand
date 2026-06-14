# Phase 5 — Row Level Security verification

This is the most important safety check: proving that one user can **never**
see or modify another user's data. It could **not** be run automatically in
the build session because of two environment constraints (see PROGRESS.md):

1. The `user_data` table didn't exist yet (run `supabase/schema.sql` first).
2. The project has **email confirmation ON** and **anonymous sign-in OFF**, so
   no authenticated session could be created from the client.

Once you've cleared the prerequisites below, run the harness — it performs the
full two-account isolation test end to end and prints PASS/FAIL for each check.

---

## Prerequisites (one time)

1. **Create the table + policies.** Open Supabase dashboard → SQL Editor, paste
   all of `supabase/schema.sql`, and Run. (See that file's header.)

2. **Allow the test accounts to sign in.** Pick ONE:
   - **Easiest for testing:** Dashboard → Authentication → Sign In / Providers →
     Email → turn **OFF** "Confirm email", then Save. (You can turn it back on
     afterwards.) This lets the harness create + sign in test accounts directly.
   - **Or** keep confirmation on and manually confirm two accounts
     (Authentication → Users → invite/confirm), then put their credentials in
     the harness.

---

## How to run

1. Start the app (`npm run dev`) and open it in the browser.
2. Open DevTools → Console.
3. Paste your project URL + publishable (anon) key into the CONFIG block below,
   then paste the whole script into the console and press Enter.
4. Read the PASS/FAIL summary.

```js
// ===== CONFIG — fill these in (same values as your .env.local) =====
const SUPABASE_URL = "https://YOUR-PROJECT.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_xxx";
const A = { email: "ligand.rls.a@gmail.com", password: "TestPass123!" };
const B = { email: "ligand.rls.b@gmail.com", password: "TestPass123!" };
// ===================================================================

const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const results = [];
const check = (name, pass, extra = "") =>
  results.push(`${pass ? "✅ PASS" : "❌ FAIL"} — ${name}${extra ? "  ·  " + extra : ""}`);

async function signInOrUp({ email, password }) {
  let r = await sb.auth.signInWithPassword({ email, password });
  if (r.error) {
    const up = await sb.auth.signUp({ email, password });
    if (up.error) throw new Error(`auth failed for ${email}: ${up.error.message}`);
    r = await sb.auth.signInWithPassword({ email, password });
    if (r.error) throw new Error(
      `sign-in failed for ${email}: ${r.error.message} ` +
      `(is email confirmation still ON?)`
    );
  }
  return r.data.user;
}

try {
  // --- Account A writes its own data ---
  const ua = await signInOrUp(A);
  await sb.from("user_data").upsert(
    { user_id: ua.id, data: { marker: "ACCOUNT_A", goal: "Account A's goal" } },
    { onConflict: "user_id" }
  );
  let own = await sb.from("user_data").select("data").eq("user_id", ua.id).maybeSingle();
  check("A can read its own row", own.data?.data?.marker === "ACCOUNT_A", JSON.stringify(own.data?.data));

  // --- Account B writes its own data ---
  await sb.auth.signOut();
  const ub = await signInOrUp(B);
  await sb.from("user_data").upsert(
    { user_id: ub.id, data: { marker: "ACCOUNT_B", goal: "Account B's goal" } },
    { onConflict: "user_id" }
  );
  let ownB = await sb.from("user_data").select("data").eq("user_id", ub.id).maybeSingle();
  check("B can read its own row", ownB.data?.data?.marker === "ACCOUNT_B", JSON.stringify(ownB.data?.data));

  // --- B tries to read A's row (must be denied / empty) ---
  let cross = await sb.from("user_data").select("data").eq("user_id", ua.id);
  check("B CANNOT read A's row (RLS isolation)", Array.isArray(cross.data) && cross.data.length === 0,
    `rows returned: ${cross.data?.length}`);

  // --- B tries to overwrite A's row (must affect 0 rows) ---
  let hijack = await sb.from("user_data").update({ data: { marker: "HIJACKED" } })
    .eq("user_id", ua.id).select();
  check("B CANNOT overwrite A's row", Array.isArray(hijack.data) && hijack.data.length === 0,
    `rows updated: ${hijack.data?.length}`);

  // --- Back to A: confirm A's data is intact and unchanged ---
  await sb.auth.signOut();
  await signInOrUp(A);
  let again = await sb.from("user_data").select("data").eq("user_id", ua.id).maybeSingle();
  check("A's data still intact after B's attempts", again.data?.data?.marker === "ACCOUNT_A",
    JSON.stringify(again.data?.data));

  // --- Unauthenticated read is denied ---
  await sb.auth.signOut();
  let anon = await sb.from("user_data").select("user_id");
  check("Anonymous (signed-out) read returns nothing", Array.isArray(anon.data) && anon.data.length === 0,
    `rows: ${anon.data?.length}`);

} catch (e) {
  results.push("❌ ERROR — " + e.message);
}

console.log("\n===== RLS VERIFICATION =====\n" + results.join("\n") + "\n============================");
```

## What a correct result looks like

All six lines should read **✅ PASS**. The two critical ones are:

- `B CANNOT read A's row (RLS isolation)` — proves SELECT is locked to `auth.uid()`.
- `B CANNOT overwrite A's row` — proves UPDATE is locked to `auth.uid()`.

If either of those FAILs, **do not ship** — re-check that `schema.sql` ran fully
and that RLS shows as "enabled" on `public.user_data` in the dashboard
(Table editor → user_data → RLS).

## Also confirm visually in the app

1. Sign in as A, add a goal/task named "Account A". Reload — it persists.
2. Sign out, sign in as B. You should see B's data (or the empty/seed state),
   **never** "Account A". Add "Account B".
3. Sign back in as A — you see "Account A", never "Account B".
4. In the dashboard Table editor, `user_data` should have exactly two rows, each
   `data` blob containing only that account's content.
