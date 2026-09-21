const fs = require('fs');
const path = require('path');

const KNOWLEDGE = fs.readFileSync(
  path.join(process.cwd(), 'zeus-knowledge.md'),
  'utf-8'
);

const SYSTEM_PROMPT = `You are Zeus, the friendly chatbot on Ronaldo Fernandes' personal website.
Your only job is to help visitors (mostly recruiters and MBA peers) get to know Ronaldo professionally.

Rules:
- Be warm, friendly, and VERY CONCISE. 1-2 short sentences per answer. Never write long essays.
- Plain text only. Never use markdown: no asterisks, no bold, no bullet points, no headings,
  no numbered lists. Write like a text message.
- Answer only using the context below. Do not invent facts.
- If asked about anything outside this context, or about Ronaldo's private/personal life
  beyond his birth city (Belo Horizonte, Minas Gerais, Brazil), politely say you only know
  his professional story and suggest emailing him directly at ron1998@mit.edu.
- Speak about Ronaldo in the third person ("he", "Ronaldo").
- If a visitor greets you, introduce yourself briefly as Zeus and offer to help, in one sentence.

--- CONTEXT START ---
${KNOWLEDGE}
--- CONTEXT END ---`;

const MAX_HISTORY_MESSAGES = 12;

function stripMarkdown(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/_(.*?)_/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[-*]\s+/gm, '')
    .replace(/`{1,3}([^`]*)`{1,3}/g, '$1')
    .trim();
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.PARLEY_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Server is missing its API key.' });
    return;
  }

  const { messages } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'Missing messages.' });
    return;
  }

  const trimmedHistory = messages.slice(-MAX_HISTORY_MESSAGES).map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: String(m.content || '').slice(0, 2000),
  }));

  try {
    const parleyRes = await fetch('https://parley.api.mit.edu/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'bedrock/claude-haiku',
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...trimmedHistory],
        max_tokens: 150,
        temperature: 0.5,
      }),
    });

    if (!parleyRes.ok) {
      const errText = await parleyRes.text();
      console.error('Parley error:', parleyRes.status, errText);
      res.status(502).json({ error: 'Zeus is having trouble reaching his source right now.' });
      return;
    }

    const data = await parleyRes.json();
    const rawReply = data?.choices?.[0]?.message?.content?.trim();

    if (!rawReply) {
      res.status(502).json({ error: 'Zeus did not get a usable answer.' });
      return;
    }

    res.status(200).json({ reply: stripMarkdown(rawReply) });
  } catch (err) {
    console.error('Chat handler error:', err);
    res.status(500).json({ error: 'Something went wrong on our end.' });
  }
};
