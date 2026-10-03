const { callGemini, handler, httpError } = require("./_lib/gemini");

const SYSTEM = `You are a tutor for the Licensure Examination for Teachers (LET) in the Philippines.
Explain in 2-4 plain sentences (no markdown) why the correct answer is correct. If the learner's answer is given and wrong, briefly say why it is not correct.
Base the explanation on the question and choices. If you are unsure, say so instead of inventing facts.`;

const L = i => String.fromCharCode(65 + i);

module.exports = handler(async ({ question, choices, correctIndex, userIndex }) => {
  if (typeof question !== "string" || !question.trim() || question.length > 3000) throw httpError(400, "Invalid question.");
  if (!Array.isArray(choices) || choices.length < 2 || choices.length > 8 || choices.some(c => typeof c !== "string" || c.length > 1000)) throw httpError(400, "Invalid choices.");
  if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= choices.length) throw httpError(400, "Invalid correct answer.");
  let prompt = `Question: ${question}\nChoices:\n${choices.map((c, i) => `${L(i)}. ${c}`).join("\n")}\nCorrect answer: ${L(correctIndex)}. ${choices[correctIndex]}`;
  if (Number.isInteger(userIndex) && userIndex >= 0 && userIndex < choices.length && userIndex !== correctIndex) prompt += `\nLearner's answer: ${L(userIndex)}. ${choices[userIndex]}`;
  const explanation = await callGemini({ system: SYSTEM, prompt, maxOutputTokens: 600, temperature: 0.3 });
  return { explanation: explanation.trim() };
});
