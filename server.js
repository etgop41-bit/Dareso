const express = require('express');
const axios = require('axios');
const NodeCache = require('node-cache');
const path = require('path');

const app = express();
const cache = new NodeCache({ stdTTL: 300 });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// In-memory leaderboard
let leaderboard = [];

const RANKS = [
  { min: 0,    name: 'Dare Rookie',     emoji: '🥚' },
  { min: 200,  name: 'Dare Beginner',   emoji: '🐣' },
  { min: 500,  name: 'Dare Player',     emoji: '🎮' },
  { min: 900,  name: 'Dare Challenger', emoji: '⚔️' },
  { min: 1400, name: 'Dare Hustler',    emoji: '💰' },
  { min: 2000, name: 'Dare Warrior',    emoji: '🛡️' },
  { min: 3000, name: 'Dare Addict',     emoji: '🔥' },
  { min: 4500, name: 'Dare Beast',      emoji: '🦁' },
  { min: 6500, name: 'Daredevil',       emoji: '😈' },
  { min: 9000, name: 'Dare Maximus',    emoji: '👑' },
];

function getRank(score) {
  let r = RANKS[0];
  for (const rk of RANKS) if (score >= rk.min) r = rk;
  return r;
}

// ─────────────────────────────────────────────
// CLAUDE AI ANALYSIS — replaces X API
// ─────────────────────────────────────────────
async function analyzeWithClaude(username) {
  const prompt = `You are a DAREMAXXING score calculator. Search the web for X/Twitter user @${username} and analyze their dare activity.

Search for:
1. Their X/Twitter profile: followers count, tweet count, bio, display name
2. Any of their tweets/posts mentioning: dare, daremarket, @daremarket, #daremarket, daremaxxing, #daremaxxing
3. Evidence of them doing any of these specific dares (search X and the web):
   - Solana 65000 times challenge
   - Staring contest (don't blink)
   - Ask a stranger to propose/record proposal
   - Drink own urine
   - Golden shower dare
   - Eat raw onion with hot sauce
   - Eat tablespoon of wasabi
   - Wax armpit
   - Elastic band on back
   - Elastic band on stomach
   - 60-second ice bath
   - Trick shot nut shot
   - Tongue in mousetrap
   - Squeeze lemon juice into eyes
   - Waterboarded for 10 seconds
   - Cinnamon challenge

Be thorough — search their profile, search for their username with dare-related terms.

Respond ONLY with this exact JSON structure, no markdown, no extra text:
{
  "found": true,
  "displayName": "Their Display Name",
  "bio": "their bio text",
  "followers": 1234,
  "tweetCount": 5678,
  "dareMarketMentions": 3,
  "daremaxxingMentions": 1,
  "dareMentions": 5,
  "daresFound": [
    {
      "label": "Exact dare name",
      "pts": 100,
      "diff": "hard",
      "evidence": "brief description of what they posted/did"
    }
  ],
  "topPost": "description of their most notable dare-related post",
  "notes": "any other relevant dare activity found"
}

If user not found on X, set found to false and use 0 for numbers.
Dare difficulty and points:
- Solana 65000: 2000pts, legend
- Staring contest: 800pts, extreme  
- Propose to stranger: 700pts, extreme
- Drink urine: 650pts, extreme
- Golden shower: 600pts, extreme
- Raw onion+hot sauce: 400pts, hard
- Wasabi tablespoon: 380pts, hard
- Wax armpit: 350pts, hard
- Ice bath 60sec: 340pts, hard
- Trick shot nut shot: 320pts, hard
- Tongue mousetrap: 300pts, hard
- Lemon in eyes: 280pts, hard
- Waterboard 10sec: 260pts, hard
- Cinnamon challenge: 150pts, med
- Elastic band stomach: 100pts, easy
- Elastic band back: 80pts, easy`;

  const response = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: prompt }]
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      }
    }
  );

  // Extract text from response
  const textBlocks = (response.data.content || []).filter(b => b.type === 'text');
  const fullText = textBlocks.map(b => b.text).join('');

  // Parse JSON from response
  const jsonMatch = fullText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON in Claude response');

  return JSON.parse(jsonMatch[0]);
}

// ─────────────────────────────────────────────
// SCORE CALCULATOR
// ─────────────────────────────────────────────
function calculateScore(data) {
  let score = 0;

  // Mention scores
  score += (data.dareMarketMentions || 0) * 80;
  score += (data.daremaxxingMentions || 0) * 120;
  score += Math.min(data.dareMentions || 0, 30) * 15;

  // Dare scores
  const daresFound = data.daresFound || [];
  score += daresFound.reduce((s, d) => s + (d.pts || 0), 0);

  // Follower bonus
  const followerBonus = Math.min(Math.floor((data.followers || 0) / 100), 500);
  score += followerBonus;

  return {
    total: Math.max(score, data.found ? 30 : 10),
    breakdown: {
      dareMarketScore: (data.dareMarketMentions || 0) * 80,
      daremaxxingScore: (data.daremaxxingMentions || 0) * 120,
      dareMentionScore: Math.min(data.dareMentions || 0, 30) * 15,
      daresScore: daresFound.reduce((s, d) => s + (d.pts || 0), 0),
      followerBonus
    }
  };
}

// ─────────────────────────────────────────────
// API ROUTES
// ─────────────────────────────────────────────
app.get('/api/score/:username', async (req, res) => {
  const username = req.params.username.replace('@', '').trim();
  if (!username) return res.status(400).json({ error: 'Username required' });

  // Check cache
  const cached = cache.get(username.toLowerCase());
  if (cached) return res.json({ ...cached, cached: true });

  try {
    // Analyze with Claude AI web search
    const aiData = await analyzeWithClaude(username);

    if (!aiData.found) {
      return res.status(404).json({ error: `@${username} not found on X or no public activity detected` });
    }

    // Calculate score
    const scored = calculateScore(aiData);
    const rank = getRank(scored.total);
    const percentage = Math.min(Math.round((scored.total / 10000) * 100), 100);

    const result = {
      username,
      displayName: aiData.displayName || username,
      bio: aiData.bio || '',
      followers: aiData.followers || 0,
      tweetCount: aiData.tweetCount || 0,
      score: scored.total,
      percentage,
      rank: rank.name,
      rankEmoji: rank.emoji,
      dareMarketMentions: aiData.dareMarketMentions || 0,
      daremaxxingMentions: aiData.daremaxxingMentions || 0,
      dareMentions: aiData.dareMentions || 0,
      daresFound: aiData.daresFound || [],
      totalDaresFound: (aiData.daresFound || []).length,
      topPost: aiData.topPost || '',
      notes: aiData.notes || '',
      breakdown: scored.breakdown,
      timestamp: new Date().toISOString()
    };

    // Cache result
    cache.set(username.toLowerCase(), result);

    // Update leaderboard
    const idx = leaderboard.findIndex(u => u.username.toLowerCase() === username.toLowerCase());
    const entry = {
      username: result.username,
      displayName: result.displayName,
      score: result.score,
      percentage,
      rank: rank.name,
      rankEmoji: rank.emoji,
      totalDaresFound: result.totalDaresFound,
      followers: result.followers,
      timestamp: result.timestamp
    };
    if (idx >= 0) leaderboard[idx] = entry;
    else leaderboard.push(entry);

    res.json(result);

  } catch (err) {
    console.error('Score error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Analysis failed: ' + (err.message || 'Unknown error') });
  }
});

app.get('/api/leaderboard', (req, res) => {
  res.json([...leaderboard].sort((a, b) => b.score - a.score));
});

app.get('/api/health', (req, res) => res.json({ ok: true, users: leaderboard.length, version: '2.0' }));

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('\n');
  console.log('  😈  DAREMAXXING v2.0 — AI-Powered');
  console.log(`  🔥  http://localhost:${PORT}`);
  console.log('  💀  No X API needed. Claude does the work.');
  console.log('\n');
});
