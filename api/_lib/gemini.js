// Shared Gemini helper. Change the model with the GEMINI_MODEL env var (no code edits needed).
const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";
const sleep = ms => new Promise(r => setTimeout(r, ms));

function httpError(status, message) { const e = new Error(message); e.status = status; return e; }

async function callGemini({ system, prompt, schema, maxOutputTokens = 4096, temperature = 0 }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw httpError(500, "The server is missing GEMINI_API_KEY.");
  const generationConfig = { temperature, maxOutputTokens };
  if (/2\.5-flash/.test(MODEL)) generationConfig.thinkingConfig = { thinkingBudget: 0 }; // faster, cheaper
  if (schema) Object.assign(generationConfig, { responseMimeType: "application/json", responseSchema: schema });
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig
  });
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
  let res;
  for (let attempt = 0; attempt < 2; attempt++) {
    res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body });
    if (res.status !== 500 && res.status !== 503) break;
    await sleep(1500);
  }
  if (res.status === 429) throw httpError(429, "The AI service is busy or over its limit. Wait a minute and try again.");
  if (!res.ok) {
    const errText = await res.text();
    console.error("Gemini error", res.status, errText);
    let detail = ""; try { detail = JSON.parse(errText).error?.message || ""; } catch {}
    let hint = "";
    if (res.status === 404) hint = "The model is not available. Set GEMINI_MODEL in Vercel to a current model.";
    else if (res.status === 403 || (res.status === 400 && /api key/i.test(detail))) hint = "The API key was rejected. Check GEMINI_API_KEY in Vercel.";
    throw httpError(502, `AI error ${res.status}. ${hint} ${detail.slice(0, 200)}`.replace(/\s+/g, " ").trim());
  }
  const data = await res.json();
  const text = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("");
  if (!text) throw httpError(502, "The AI returned an empty response. Please try again.");
  return text;
}

// Login is required by default so only signed-in users can spend your Gemini quota. Needs SUPABASE_URL and SUPABASE_ANON_KEY. Set REQUIRE_LOGIN=false to turn off.
async function requireUser(req) {
  if (process.env.REQUIRE_LOGIN === "false") return;
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) throw httpError(500, "Server setup incomplete: add SUPABASE_URL and SUPABASE_ANON_KEY in Vercel (or set REQUIRE_LOGIN=false), then redeploy.");
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) throw httpError(401, "Sign in with Google to use AI features.");
  const r = await fetch(process.env.SUPABASE_URL + "/auth/v1/user", { headers: { Authorization: "Bearer " + token, apikey: process.env.SUPABASE_ANON_KEY } });
  if (!r.ok) throw httpError(401, "Your session expired. Please sign in again.");
}

function handler(fn) {
  return async (req, res) => {
    try {
      if (req.method !== "POST") throw httpError(405, "Use POST.");
      await requireUser(req);
      res.status(200).json(await fn(req.body || {}));
    } catch (e) {
      if (!e.status) console.error(e);
      res.status(e.status || 500).json({ error: e.status ? e.message : "Something went wrong. Please try again." });
    }
  };
}

module.exports = { callGemini, handler, httpError };
