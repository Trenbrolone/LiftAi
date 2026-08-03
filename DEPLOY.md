# Deploying LiftAI (so the AI planner works with no user key)

The AI planner calls a small serverless function in `api/plan.js`. That function
holds a Groq API key as a **server-side secret**, so people using the site never
need their own key. The key is never in this repository.

You only need to do this once.

## 1. Get a free Groq API key

1. Go to <https://console.groq.com> and sign in (Google or GitHub).
2. Open **API Keys**, click **Create API Key**, and copy it (it starts with
   `gsk_...`). Keep it private.

## 2. Deploy the repo to Vercel (free)

1. Go to <https://vercel.com> and sign in with your GitHub account.
2. Click **Add New… → Project** and import `Trenbrolone/LiftAi`.
3. Framework Preset: **Other**. Leave the build/output settings empty — this is
   a static site plus one serverless function, so there is no build step.
4. Before deploying, open **Environment Variables** and add:
   - **Name:** `GROQ_API_KEY`
   - **Value:** the key you copied in step 1
5. Click **Deploy**.

Vercel gives you a live URL (e.g. `https://liftai.vercel.app`). Open it: the
library, log, and AI planner all work, and the planner needs no key from the
user.

## Updating the key

Change `GROQ_API_KEY` in **Vercel → Project → Settings → Environment
Variables**, then redeploy. Never put the key in the code.

## Notes / limitations

- **You still need one key** — it just lives on the server as a secret instead
  of in each user's browser. Your Groq free-tier quota covers everyone who
  uses the site.
- **Free-tier rate limits apply** to the whole site, not per user.
- The function currently accepts requests from any origin (`Access-Control-Allow-Origin: *`)
  so it is easy to test. If the site is popular enough that people might abuse
  your quota, restrict that header to your own site's URL in `api/plan.js`.
- **Opening `index.html` directly from your computer (file://) will not run the
  AI planner** — there is no server there. Use the Vercel URL, or run
  `npx vercel dev` locally. Everything else (library, log) still works offline.
