// Serverless function (Vercel, Node 18+ for global fetch).
//
// The Groq API key is a SERVER-SIDE SECRET: set GROQ_API_KEY in the Vercel
// project's Environment Variables. It is never sent to the browser and never
// committed to this repository. This is what lets users generate programs
// without needing their own key.
//
// The prompt is fixed here so this endpoint can only be used to generate
// workout programs (it cannot be abused to run arbitrary prompts on your key).
//
// Get a free key at https://console.groq.com.
//
// The model is read from the GROQ_MODEL environment variable so it can be
// changed in Vercel's settings without editing or redeploying this code. This
// matters because Groq retires models: llama-3.3-70b-versatile was
// decommissioned on 2026-08-16, which is why the planner started returning
// "the model does not exist or you do not have access to it". If that happens
// again, set GROQ_MODEL to a current model (see console.groq.com/docs/models)
// instead of changing the line below. The default is Groq's recommended
// replacement at the time of writing.

const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed.' }); return; }

  const key = process.env.GROQ_API_KEY;
  if (!key) { res.status(500).json({ error: 'Server is not configured (missing GROQ_API_KEY).' }); return; }

  const body = req.body || {};
  const goal = String(body.goal || '');
  const days = parseInt(body.days, 10);
  const level = String(body.level || '');
  const available = (Array.isArray(body.available) ? body.available : [])
    .filter(function (x) { return typeof x === 'string'; })
    .slice(0, 300);
  if (!goal || !days || !level || available.length === 0) {
    res.status(400).json({ error: 'Missing or invalid preferences.' });
    return;
  }

  const system = 'You are a strength and conditioning coach. Design a weekly workout ' +
    'program and respond with ONLY a JSON object of exactly this shape:\n' +
    '{"program_name": string, "days": [{"day": string, "focus": string, ' +
    '"exercises": [{"name": string, "sets": integer, "reps": string}]}]}\n' +
    'Use ONLY exercises from the supplied list. Choose a training split appropriate to ' +
    'the number of days per week. Match set and rep schemes to the goal: strength = low ' +
    'reps (about 3-6), muscle = moderate (about 8-12), general fitness or fat loss = ' +
    'higher (about 10-15). Scale the difficulty to the experience level. Keep the ' +
    'program realistic and safe. Do not include any text outside the JSON.';
  const user = 'Preferences:\n- Goal: ' + goal + '\n- Days per week: ' + days +
    '\n- Experience: ' + level + '\n- Exercises to choose from (use only these):\n' +
    available.join(', ');

  let gres;
  try {
    gres = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': 'Bearer ' + key
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ],
        response_format: { type: 'json_object' },
        // gpt-oss-120b is a reasoning model and its reasoning counts toward the
        // completion budget; keep it low so the JSON program is never cut off.
        reasoning_effort: 'low',
        max_completion_tokens: 2048,
        temperature: 0.7
      })
    });
  } catch (e) {
    res.status(502).json({ error: 'Could not reach the AI service.' });
    return;
  }

  const data = await gres.json().catch(function () { return {}; });
  if (!gres.ok) {
    const msg = (data && data.error && data.error.message) || 'AI request failed.';
    res.status(gres.status === 429 ? 429 : 502).json({ error: msg });
    return;
  }
  const choice = (data.choices || [])[0];
  if (choice && choice.finish_reason === 'length') {
    res.status(200).json({ error: 'The plan was cut off. Try fewer days per week.' });
    return;
  }
  const content = choice && choice.message && choice.message.content;
  if (!content) { res.status(200).json({ error: 'No plan was returned. Try again.' }); return; }

  let plan;
  try { plan = JSON.parse(content); } catch (e) {
    res.status(502).json({ error: 'The AI returned an unreadable plan.' });
    return;
  }
  res.status(200).json({ plan: plan });
};
