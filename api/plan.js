// Serverless function (Vercel, Node 18+ for global fetch).
//
// The Gemini API key is a SERVER-SIDE SECRET: set GEMINI_API_KEY in the Vercel
// project's Environment Variables. It is never sent to the browser and never
// committed to this repository. This is what lets users generate programs
// without needing their own key.
//
// The prompt and schema are fixed here so this endpoint can only be used to
// generate workout programs (it cannot be abused to run arbitrary prompts on
// your key).

const GEMINI_MODEL = 'gemini-2.5-flash';

const PLAN_SCHEMA = {
  type: 'OBJECT',
  properties: {
    program_name: { type: 'STRING' },
    days: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          day: { type: 'STRING' },
          focus: { type: 'STRING' },
          exercises: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                name: { type: 'STRING' },
                sets: { type: 'INTEGER' },
                reps: { type: 'STRING' }
              },
              required: ['name', 'sets', 'reps'],
              propertyOrdering: ['name', 'sets', 'reps']
            }
          }
        },
        required: ['day', 'focus', 'exercises'],
        propertyOrdering: ['day', 'focus', 'exercises']
      }
    }
  },
  required: ['program_name', 'days'],
  propertyOrdering: ['program_name', 'days']
};

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed.' }); return; }

  const key = process.env.GEMINI_API_KEY;
  if (!key) { res.status(500).json({ error: 'Server is not configured (missing GEMINI_API_KEY).' }); return; }

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
    'program as JSON matching the provided schema. Use ONLY exercises from the supplied ' +
    'list. Choose a training split appropriate to the number of days per week. Match set ' +
    'and rep schemes to the goal: strength = low reps (about 3-6), muscle = moderate ' +
    '(about 8-12), general fitness or fat loss = higher (about 10-15). Scale the difficulty ' +
    'to the experience level. Keep the program realistic and safe.';
  const user = 'Preferences:\n- Goal: ' + goal + '\n- Days per week: ' + days +
    '\n- Experience: ' + level + '\n- Exercises to choose from (use only these):\n' +
    available.join(', ');

  let gres;
  try {
    gres = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL + ':generateContent', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ parts: [{ text: user }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: PLAN_SCHEMA,
          maxOutputTokens: 4096,
          thinkingConfig: { thinkingBudget: 0 }
        }
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
  if (data.promptFeedback && data.promptFeedback.blockReason) {
    res.status(200).json({ error: 'The request was declined by the safety system.' });
    return;
  }
  const candidate = (data.candidates || [])[0];
  if (candidate && candidate.finishReason === 'MAX_TOKENS') {
    res.status(200).json({ error: 'The plan was cut off. Try fewer days per week.' });
    return;
  }
  const part = candidate && candidate.content && (candidate.content.parts || []).find(function (pt) { return pt.text; });
  if (!part) { res.status(200).json({ error: 'No plan was returned. Try again.' }); return; }

  let plan;
  try { plan = JSON.parse(part.text); } catch (e) {
    res.status(502).json({ error: 'The AI returned an unreadable plan.' });
    return;
  }
  res.status(200).json({ plan: plan });
};
