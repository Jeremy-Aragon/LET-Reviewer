/* ===== State ===== */
const appState = {
  currentView: "home",
  reviewer: { title: "", questions: [] },
  testSettings: { questionCount: 0, shuffleQuestions: true, shuffleChoices: true, timerEnabled: false, timerMinutes: null },
  test: { questions: [], currentQuestion: 0, answers: {}, startedAt: null, submittedAt: null, endsAt: null },
  results: null
};
const STORE_KEY = "let-ai-reviewer-v1";
const L = i => String.fromCharCode(65 + i);
const $ = id => document.getElementById(id);
let timerId = null, editingIndex = null;

/* ===== Persistence (no credentials stored) ===== */
function saveState() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ reviewer: appState.reviewer, testSettings: appState.testSettings, test: appState.test, results: appState.results, currentView: appState.currentView })); } catch (e) {}
}
function loadState() {
  try { const s = JSON.parse(localStorage.getItem(STORE_KEY)); if (s) Object.assign(appState, s); } catch (e) {}
}
function clearState() { localStorage.removeItem(STORE_KEY); }

/* ===== AI integration points (connect Gemini here) ===== */
async function parseReviewerWithAI(rawText) {
  // Gemini API integration will be added by me.
  // Until then, returning undefined makes the app use localFallbackParser below.
}
async function explainAnswerWithAI(questionData) {
  // Gemini API integration will be added by me.
  // questionData: { question, choices, correctIndex, userIndex }
}

/* Simple offline parser so the UI works before Gemini is connected. Handles "1. text / A. choice / Answer: B". */
function localFallbackParser(raw, title) {
  const questions = [];
  raw.split(/\n\s*(?=\d+[.)]\s)/).forEach(block => {
    const m = block.trim().match(/^\d+[.)]\s+([\s\S]*?)\n\s*A[.)]\s/);
    if (!m) return;
    const choices = [...block.matchAll(/^\s*([A-H])[.)]\s+(.+)$/gm)].map(x => x[2].trim());
    const a = block.match(/answer\s*[:\-]?\s*\(?([A-H])\)?/i);
    questions.push({ id: "q" + (questions.length + 1), question: m[1].replace(/\s+/g, " ").trim(), choices, answer: a ? a[1].toUpperCase().charCodeAt(0) - 65 : null, explanation: null });
  });
  return { title, questions };
}

/* ===== Validation: never guesses answers ===== */
function questionProblem(q) {
  if (!q || typeof q.question !== "string" || !q.question.trim()) return "has no question text";
  if (!Array.isArray(q.choices) || q.choices.length < 2) return "needs at least 2 choices";
  if (q.choices.some(c => typeof c !== "string" || !c.trim())) return "has an empty choice";
  if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.choices.length) return "has no valid answer";
  return null;
}
function validateReviewer(data) {
  if (!data || !Array.isArray(data.questions)) return { ok: false, error: "The parser did not return a list of questions.", problems: [] };
  if (!data.questions.length) return { ok: false, error: "No questions were detected. Check the pasted text.", problems: [] };
  const problems = [];
  data.questions.forEach((q, i) => { const p = questionProblem(q); if (p) problems.push({ index: i, text: `Question ${i + 1} ${p}.` }); });
  return { ok: true, problems };
}

/* ===== Shuffle (Fisher-Yates; returns copies, never mutates) ===== */
function shuffleArray(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; }
  return copy;
}
/* Test-specific copy. Correct answer is re-derived from the shuffled order, not reused. */
function buildTestQuestion(q, shuffleChoices) {
  const order = shuffleChoices ? shuffleArray(q.choices.map((_, i) => i)) : q.choices.map((_, i) => i);
  return { id: q.id, question: q.question, choices: order.map(i => q.choices[i]), answer: order.indexOf(q.answer), explanation: q.explanation ?? null };
}

/* ===== Views ===== */
function showView(name) {
  appState.currentView = name;
  document.querySelectorAll(".view").forEach(v => v.classList.toggle("hidden", v.id !== name));
  if (name === "preview") renderPreview();
  if (name === "settings") renderSettings();
  if (name === "test") renderTest();
  if (name === "results") renderResults();
  if (name === "review") renderReview();
  if (name === "mine") renderMine();
  window.scrollTo(0, 0);
  saveState();
}
document.addEventListener("click", e => { const b = e.target.closest("[data-go]"); if (b) { e.preventDefault(); showView(b.dataset.go); } });

/* ===== Create ===== */
$("raw").addEventListener("input", () => { $("chars").textContent = $("raw").value.length.toLocaleString(); });
$("clearBtn").onclick = () => { $("raw").value = ""; $("title").value = ""; $("chars").textContent = "0"; $("qcount").textContent = ""; $("createMsg").textContent = ""; };
$("parseBtn").onclick = async () => {
  const raw = $("raw").value.trim(), msg = $("createMsg"), btn = $("parseBtn");
  const title = $("title").value.trim() || "Untitled Reviewer";
  msg.className = "msg"; msg.textContent = "";
  if (!raw) { msg.textContent = "Paste your reviewer text first."; return; }
  btn.disabled = true; btn.textContent = "Parsing...";
  try {
    const data = (await parseReviewerWithAI(raw)) || localFallbackParser(raw, title);
    const v = validateReviewer(data);
    if (!v.ok) { msg.textContent = v.error; return; }
    data.questions.forEach((q, i) => { q.id = q.id || "q" + (i + 1); });
    appState.reviewer = { title: $("title").value.trim() || data.title || title, questions: data.questions };
    $("qcount").textContent = `· ${data.questions.length} questions found`;
    showView("preview");
  } catch (err) { msg.textContent = "Parsing failed. Please try again."; console.error(err); }
  finally { btn.disabled = false; btn.textContent = "Parse Reviewer"; }
};

/* ===== Preview & edit ===== */
function renderPreview() {
  const { title, questions } = appState.reviewer;
  $("pvTitle").textContent = title; $("pvCount").textContent = `${questions.length} Questions`;
  const bad = questions.map((q, i) => questionProblem(q) ? i : -1).filter(i => i >= 0);
  $("pvWarn").textContent = bad.length ? `⚠ ${bad.length} question(s) need fixing before you can continue.` : "";
  $("toSettings").disabled = bad.length > 0 || !questions.length;
  $("pvList").innerHTML = "";
  questions.forEach((q, i) => {
    const p = questionProblem(q), card = document.createElement("div");
    card.className = "qcard" + (p ? " invalid" : "");
    const choices = (q.choices || []).map(c => `<li>${esc(c)}</li>`).join("");
    card.innerHTML = `<div class="qhead"><span>Question ${i + 1}</span><span><button class="btn small" data-edit="${i}">Edit</button> <button class="btn small danger" data-del="${i}">Delete</button></span></div>
      ${p ? `<p class="warnline">⚠ Question ${i + 1} ${p}. Please edit this question before continuing.</p>` : ""}
      <p>${esc(q.question || "")}</p><ol>${choices}</ol>
      <div class="muted">Correct Answer: <strong>${Number.isInteger(q.answer) && q.choices && q.answer < q.choices.length ? L(q.answer) : "—"}</strong></div>`;
    $("pvList").appendChild(card);
  });
}
function esc(s) { const d = document.createElement("div"); d.textContent = s ?? ""; return d.innerHTML; }
$("pvList").addEventListener("click", e => {
  const ed = e.target.closest("[data-edit]"), del = e.target.closest("[data-del]");
  if (ed) openEdit(+ed.dataset.edit);
  if (del && confirm("Delete this question?")) { appState.reviewer.questions.splice(+del.dataset.del, 1); saveState(); renderPreview(); }
});
$("addQ").onclick = () => {
  appState.reviewer.questions.push({ id: "q" + Date.now(), question: "", choices: ["", "", "", ""], answer: null, explanation: null });
  openEdit(appState.reviewer.questions.length - 1, true);
};
$("toSettings").onclick = () => showView("settings");

function openEdit(i, isNew) {
  editingIndex = i; const q = appState.reviewer.questions[i];
  $("eQ").value = q.question || ""; $("eMsg").textContent = "";
  const n = Math.max(4, (q.choices || []).length);
  $("eChoices").innerHTML = Array.from({ length: n }, (_, k) => `<div class="crow"><b>${L(k)}</b><input class="ech" aria-label="Choice ${L(k)}" value="${esc((q.choices || [])[k] || "").replace(/"/g, "&quot;")}"></div>`).join("");
  $("eAns").innerHTML = `<option value="">Select…</option>` + Array.from({ length: n }, (_, k) => `<option value="${k}">${L(k)}</option>`).join("");
  $("eAns").value = Number.isInteger(q.answer) ? q.answer : "";
  $("editDlg").dataset.isNew = isNew ? "1" : ""; $("editDlg").showModal();
}
$("eSave").onclick = () => {
  const choices = [...document.querySelectorAll(".ech")].map(x => x.value.trim());
  while (choices.length > 2 && !choices[choices.length - 1]) choices.pop();
  const ans = $("eAns").value === "" ? null : +$("eAns").value;
  const draft = { question: $("eQ").value.trim(), choices, answer: ans };
  const p = questionProblem(draft);
  if (p) { $("eMsg").textContent = `This question ${p}.`; return; }
  Object.assign(appState.reviewer.questions[editingIndex], draft);
  $("editDlg").close(); saveState(); renderPreview();
};
$("eCancel").onclick = () => {
  if ($("editDlg").dataset.isNew) appState.reviewer.questions.splice(editingIndex, 1);
  $("editDlg").close(); renderPreview();
};
$("editDlg").addEventListener("cancel", () => $("eCancel").click());

/* ===== Settings ===== */
function renderSettings() {
  const n = appState.reviewer.questions.length;
  $("stTitle").textContent = appState.reviewer.title || "—"; $("stAvail").textContent = n;
  $("stEmpty").classList.toggle("hidden", n > 0); $("stForm").classList.toggle("hidden", n === 0);
  const opts = [10, 20, 30, 50, 100].filter(x => x < n);
  $("qCount").innerHTML = `<option value="${n}">All (${n})</option>` + opts.map(x => `<option value="${x}">${x}</option>`).join("");
  const s = appState.testSettings;
  if (s.questionCount && (s.questionCount === n || opts.includes(s.questionCount))) $("qCount").value = s.questionCount;
  $("shQ").checked = s.shuffleQuestions; $("shC").checked = s.shuffleChoices;
  $("timerOn").checked = s.timerEnabled; $("timerMin").value = s.timerMinutes || 30;
  $("timerMin").classList.toggle("hidden", !s.timerEnabled);
}
$("timerOn").onchange = () => $("timerMin").classList.toggle("hidden", !$("timerOn").checked);
$("startBtn").onclick = () => {
  const src = appState.reviewer.questions;
  if (src.some(q => questionProblem(q))) { alert("Fix the invalid questions in the preview first."); return showView("preview"); }
  appState.testSettings = { questionCount: +$("qCount").value, shuffleQuestions: $("shQ").checked, shuffleChoices: $("shC").checked, timerEnabled: $("timerOn").checked, timerMinutes: $("timerOn").checked ? +$("timerMin").value : null };
  startTest();
};

/* ===== Test ===== */
function startTest() {
  const s = appState.testSettings;
  let picked = shuffleArray(appState.reviewer.questions).slice(0, s.questionCount); // random selection
  if (!s.shuffleQuestions) picked.sort((a, b) => appState.reviewer.questions.indexOf(a) - appState.reviewer.questions.indexOf(b));
  const now = Date.now();
  appState.test = { questions: picked.map(q => buildTestQuestion(q, s.shuffleChoices)), currentQuestion: 0, answers: {}, startedAt: now, submittedAt: null, endsAt: s.timerEnabled ? now + s.timerMinutes * 60000 : null };
  appState.results = null;
  showView("test");
}
function renderTest() {
  const t = appState.test, q = t.questions[t.currentQuestion];
  if (!q) return showView("home");
  $("tTitle").textContent = appState.reviewer.title;
  $("tPos").textContent = `Question ${t.currentQuestion + 1} of ${t.questions.length}`;
  $("barFill").style.width = (Object.keys(t.answers).length / t.questions.length * 100) + "%";
  $("tQ").textContent = q.question;
  $("tChoices").innerHTML = "";
  q.choices.forEach((c, i) => {
    const b = document.createElement("button");
    b.className = "choice" + (t.answers[t.currentQuestion] === i ? " sel" : "");
    b.setAttribute("role", "radio"); b.setAttribute("aria-checked", t.answers[t.currentQuestion] === i);
    b.innerHTML = `<span class="dot"></span><span>${L(i)}. ${esc(c)}</span>`;
    b.onclick = () => { t.answers[t.currentQuestion] = i; saveState(); renderTest(); };
    $("tChoices").appendChild(b);
  });
  $("prev").disabled = t.currentQuestion === 0;
  $("next").disabled = t.currentQuestion === t.questions.length - 1;
  $("nav").innerHTML = t.questions.map((_, i) => `<button data-q="${i}" class="${t.answers[i] !== undefined ? "done" : ""}${i === t.currentQuestion ? " cur" : ""}" aria-label="Question ${i + 1}${t.answers[i] !== undefined ? ", answered" : ""}">${i + 1}${t.answers[i] !== undefined ? " ✓" : ""}</button>`).join("");
  startTimer();
}
$("nav").addEventListener("click", e => { const b = e.target.closest("[data-q]"); if (b) { appState.test.currentQuestion = +b.dataset.q; saveState(); renderTest(); } });
$("prev").onclick = () => { appState.test.currentQuestion--; saveState(); renderTest(); };
$("next").onclick = () => { appState.test.currentQuestion++; saveState(); renderTest(); };

function startTimer() {
  clearInterval(timerId);
  const t = appState.test; $("timerBox").classList.toggle("hidden", !t.endsAt);
  if (!t.endsAt) return;
  const tick = () => {
    const left = Math.max(0, Math.round((t.endsAt - Date.now()) / 1000));
    $("timer").textContent = `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`;
    $("timerBox").classList.toggle("low", left <= 300);
    if (left <= 0) { clearInterval(timerId); submitTest(); }
  };
  tick(); timerId = setInterval(tick, 1000);
}

$("submitBtn").onclick = () => {
  const t = appState.test, a = Object.keys(t.answers).length, un = t.questions.length - a;
  $("subMsg").innerHTML = `You have answered ${a} of ${t.questions.length} questions.` + (un ? ` <strong style="color:var(--bad)">${un} unanswered.</strong>` : "");
  $("subDlg").showModal();
};
$("subCancel").onclick = () => $("subDlg").close();
$("subOk").onclick = () => { $("subDlg").close(); submitTest(); };

/* ===== Scoring ===== */
function submitTest() {
  clearInterval(timerId);
  const t = appState.test; if (t.submittedAt) return;
  t.submittedAt = Date.now();
  let correct = 0, incorrect = 0, unanswered = 0;
  t.questions.forEach((q, i) => { const a = t.answers[i]; if (a === undefined) unanswered++; else if (a === q.answer) correct++; else incorrect++; });
  const total = t.questions.length;
  appState.results = { total, correct, incorrect, unanswered, percentage: Math.round((correct / total) * 100) };
  saveResult(appState.results);
  if ($("subDlg").open) $("subDlg").close();
  showView("results");
}
function renderResults() {
  const r = appState.results; if (!r) return showView("home");
  $("rScore").textContent = `${r.correct} / ${r.total}`; $("rPct").textContent = r.percentage + "%";
  $("rC").textContent = r.correct; $("rI").textContent = r.incorrect; $("rU").textContent = r.unanswered;
}
$("reviewBtn").onclick = () => showView("review");
$("retake").onclick = () => showView("settings");
$("backRev").onclick = () => showView("preview");

/* ===== Answer review ===== */
function renderReview() {
  const t = appState.test; $("rvList").innerHTML = "";
  t.questions.forEach((q, i) => {
    const a = t.answers[i], st = a === undefined ? "skip" : a === q.answer ? "ok" : "bad";
    const tag = { ok: "✓ Correct", bad: "❌ Incorrect", skip: "⚠ Unanswered" }[st];
    const d = document.createElement("div"); d.className = "rv " + st;
    d.innerHTML = `<div class="muted"><strong>Question ${i + 1}</strong></div><p>${esc(q.question)}</p>
      <div><span class="muted">Your Answer:</span> ${a === undefined ? "—" : `${L(a)}. ${esc(q.choices[a])}`}</div>
      <div><span class="muted">Correct Answer:</span> ${L(q.answer)}. ${esc(q.choices[q.answer])}</div>
      <p class="tag">${tag}</p><button class="btn small">Explain Answer</button><div class="expl hidden"></div>`;
    const btn = d.querySelector("button"), box = d.querySelector(".expl");
    btn.onclick = async () => {
      box.classList.remove("hidden"); box.textContent = "Loading...";
      try {
        const out = await explainAnswerWithAI({ question: q.question, choices: q.choices, correctIndex: q.answer, userIndex: a ?? null });
        box.textContent = out || "No explanation available yet. Connect explainAnswerWithAI() in script.js.";
      } catch (e) { box.textContent = "Could not load an explanation. Please try again."; }
    };
    $("rvList").appendChild(d);
  });
}

/* ===== Supabase: auth + storage (client lives in supabase-client.js) ===== */
let currentUser = null;
function setUser(u) {
  currentUser = u;
  $("authBtn").textContent = u ? "Log out" : "Sign in with Google";
  $("myBtn").classList.toggle("hidden", !u);
}
async function initAuth() {
  const { data } = await supabaseClient.auth.getSession();
  setUser(data.session?.user ?? null);
  supabaseClient.auth.onAuthStateChange((_e, s) => setUser(s?.user ?? null));
}
$("authBtn").onclick = async () => {
  if (currentUser) { await supabaseClient.auth.signOut(); return showView("home"); }
  const { error } = await supabaseClient.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + location.pathname } });
  if (error) alert("Could not start Google sign-in. Please try again.");
};
$("saveRev").onclick = async () => {
  const m = $("pvMsg"); m.className = "msg"; m.textContent = "";
  if (!currentUser) { m.textContent = "Sign in with Google to save reviewers."; return; }
  const r = appState.reviewer;
  if (r.questions.some(q => questionProblem(q))) { m.textContent = "Fix the invalid questions before saving."; return; }
  const row = { title: r.title, question_count: r.questions.length, questions_json: r.questions };
  const res = r.id
    ? await supabaseClient.from("reviewers").update(row).eq("id", r.id).select("id").single()
    : await supabaseClient.from("reviewers").insert({ ...row, user_id: currentUser.id }).select("id").single();
  if (res.error) { m.textContent = "Could not save the reviewer. Please try again."; console.error(res.error); return; }
  r.id = res.data.id; saveState(); m.className = "msg good"; m.textContent = "Reviewer saved.";
};
async function renderMine() {
  const msg = $("mineMsg"); msg.textContent = "";
  if (!currentUser) { msg.textContent = "Sign in with Google to see your saved reviewers."; $("mineList").innerHTML = ""; $("resList").innerHTML = ""; return; }
  const [rv, rs] = await Promise.all([
    supabaseClient.from("reviewers").select("id,title,question_count,questions_json").order("created_at", { ascending: false }),
    supabaseClient.from("test_results").select("reviewer_title,score,total_questions,percentage,created_at").order("created_at", { ascending: false }).limit(10)
  ]);
  if (rv.error || rs.error) { msg.textContent = "Could not load your data. Please try again."; return; }
  $("mineList").innerHTML = rv.data.length ? "" : `<p class="muted">No saved reviewers yet. Create one to get started.</p>`;
  rv.data.forEach(r => {
    const d = document.createElement("div"); d.className = "qcard";
    d.innerHTML = `<div class="qhead"><span>${esc(r.title)} · ${r.question_count} questions</span><span><button class="btn small primary">Open</button> <button class="btn small danger">Delete</button></span></div>`;
    const [open, del] = d.querySelectorAll("button");
    open.onclick = () => { appState.reviewer = { id: r.id, title: r.title, questions: r.questions_json }; showView("settings"); };
    del.onclick = async () => { if (!confirm("Delete this reviewer?")) return; await supabaseClient.from("reviewers").delete().eq("id", r.id); renderMine(); };
    $("mineList").appendChild(d);
  });
  $("resList").innerHTML = rs.data.length
    ? rs.data.map(x => `<div class="qcard"><strong>${esc(x.reviewer_title || "Reviewer")}</strong><br>${x.score} / ${x.total_questions} · ${Math.round(x.percentage)}% · ${new Date(x.created_at).toLocaleDateString()}</div>`).join("")
    : `<p class="muted">No results yet.</p>`;
}
async function saveResult(r) {
  if (!currentUser) return;
  const t = appState.test;
  const { error } = await supabaseClient.from("test_results").insert({
    user_id: currentUser.id, reviewer_id: appState.reviewer.id ?? null, reviewer_title: appState.reviewer.title,
    score: r.correct, total_questions: r.total, percentage: r.percentage, answers_json: { answers: t.answers, questions: t.questions }
  });
  if (error) console.error(error);
}

/* ===== Init ===== */
loadState();
initAuth();
if (appState.currentView === "test" && appState.test.endsAt && Date.now() > appState.test.endsAt && !appState.test.submittedAt) submitTest();
else showView(["test", "results", "review"].includes(appState.currentView) && !appState.test.questions.length ? "home" : appState.currentView);
