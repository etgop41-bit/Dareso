require('dotenv').config();
const express = require('express');
const axios = require('axios');
const NodeCache = require('node-cache');
const path = require('path');

const app = express();
const cache = new NodeCache({ stdTTL: 300 });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const BEARER = process.env.X_BEARER_TOKEN;

// ─────────────────────────────────────────────
// ALL 16 DARES — keyword detection + scoring
// ─────────────────────────────────────────────
const DARES = [
  { id:'solana65k',      keywords:['solana 65000','65000 times','65k solana','solana65k','solana 65k'],                               pts:2000, diff:'legend',  label:'Solana 65,000 Times' },
  { id:'staring',        keywords:['staring contest','stare contest','dont blink','don\'t blink','staring dare'],                     pts:800,  diff:'extreme', label:'Staring Contest (Don\'t Blink)' },
  { id:'propose',        keywords:['propose to stranger','stranger propose','got down on one knee','marry me stranger','proposal dare'],pts:700,  diff:'extreme', label:'Ask Stranger to Propose' },
  { id:'urine',          keywords:['drink urine','drink my own','drink own urine','drank urine','urine dare','pee dare drink'],        pts:650,  diff:'extreme', label:'Drink Your Own Urine' },
  { id:'goldenshower',   keywords:['golden shower','gold shower','pee on myself','golden dare','peed on myself'],                     pts:600,  diff:'extreme', label:'Golden Shower Dare' },
  { id:'onion',          keywords:['raw onion','onion hot sauce','eat onion','onion dare','onion challenge'],                         pts:400,  diff:'hard',    label:'Raw Onion + Hot Sauce' },
  { id:'wasabi',         keywords:['tablespoon wasabi','wasabi dare','eat wasabi','wasabi challenge','spoon of wasabi'],              pts:380,  diff:'hard',    label:'Tablespoon of Wasabi' },
  { id:'wax',            keywords:['wax armpit','armpit wax','waxed my armpit','waxing dare','wax dare'],                            pts:350,  diff:'hard',    label:'Wax Your Armpit' },
  { id:'icebath',        keywords:['ice bath','60 second ice','icebath','ice bucket dare','cold water dare','ice dare'],              pts:340,  diff:'hard',    label:'60-Sec Ice Bath' },
  { id:'nutshot',        keywords:['nut shot','trick shot nut','nutshot dare','groin dare','nut dare'],                               pts:320,  diff:'hard',    label:'Trick Shot Nut Shot' },
  { id:'mousetrap',      keywords:['mouse trap','mousetrap','tongue trap','tongue mousetrap','tongue dare'],                          pts:300,  diff:'hard',    label:'Tongue in a Mousetrap' },
  { id:'lemon',          keywords:['lemon juice eye','lemon in eye','squeeze lemon into eye','lemon eyes dare'],                     pts:280,  diff:'hard',    label:'Lemon Juice in Eyes' },
  { id:'waterboard',     keywords:['waterboard','water board','waterboarded','waterboarding dare'],                                  pts:260,  diff:'hard',    label:'Waterboarded for 10 Sec' },
  { id:'cinnamon',       keywords:['cinnamon challenge','cinnamon dare','eat cinnamon','cinnamon spoon','cinnamon spoonful'],        pts:150,  diff:'med',     label:'Cinnamon Challenge' },
  { id:'elastic_stomach',keywords:['elastic band stomach','rubber band stomach','band on stomach','elastic stomach','elastic on stomach'],pts:100,diff:'easy',  label:'Elastic Band on Stomach' },
  { id:'elastic_back',   keywords:['elastic band back','rubber band back','band on back','elastic back','elastic on back'],          pts:80,   diff:'easy',    label:'Elastic Band on Back' },
];

const xHeaders = () => ({ Authorization: `Bearer ${BEARER}` });

// ─────────────────────────────────────────────
// X API CALLS
// ─────────────────────────────────────────────
async function getXUser(username) {
  const res = await axios.get(
    `https://api.twitter.com/2/users/by/username/${username}`,
    { headers: xHeaders(), params: { 'user.fields': 'public_metrics,description,profile_image_url,created_at,name' } }
  );
  return res.data.data;
}

async function getUserTweets(userId) {
  const res = await axios.get(
    `https://api.twitter.com/2/users/${userId}/tweets`,
    { headers: xHeaders(), params: { max_results: 100, 'tweet.fields': 'text,created_at,public_metrics', exclude: 'retweets' } }
  );
  return res.data.data || [];
}

async function searchUserDareTweets(username) {
  try {
    const res = await axios.get(
      'https://api.twitter.com/2/tweets/search/recent',
      { headers: xHeaders(), params: {
          query: `from:${username} (dare OR daremarket OR daremaxxing OR @daremarket OR #daremarket OR #daremaxxing)`,
          max_results: 100,
          'tweet.fields': 'text,created_at,public_metrics'
      }}
    );
    return res.data.data || [];
  } catch(e) { return []; }
}

// ─────────────────────────────────────────────
// SCORING ENGINE
// ─────────────────────────────────────────────
function analyzeTweets(tweets) {
  let dareMarketMentions = 0;
  let daremaxxingMentions = 0;
  let dareMentions = 0;
  const foundDares = [];
  const foundIds = new Set();

  for (const tweet of tweets) {
    const txt = (tweet.text || '').toLowerCase();

    if (txt.includes('daremarket') || txt.includes('@daremarket') || txt.includes('#daremarket') || txt.includes('dare market')) {
      dareMarketMentions++;
    } else if (txt.includes('daremaxxing') || txt.includes('#daremaxxing')) {
      daremaxxingMentions++;
    } else if (txt.includes('dare')) {
      dareMentions++;
    }

    for (const dare of DARES) {
      if (foundIds.has(dare.id)) continue;
      if (dare.keywords.some(kw => txt.includes(kw))) {
        foundIds.add(dare.id);
        foundDares.push({
          id: dare.id,
          label: dare.label,
          pts: dare.pts,
          diff: dare.diff,
          tweetSnippet: tweet.text.slice(0, 140),
          likes: tweet.public_metrics?.like_count || 0,
          retweets: tweet.public_metrics?.retweet_count || 0,
          date: tweet.created_at
        });
      }
    }
  }

  const dareScore = foundDares.reduce((s, d) => s + d.pts, 0);
  const mentionScore = (dareMarketMentions * 80) + (daremaxxingMentions * 120) + (Math.min(dareMentions, 30) * 15);

  return { dareMarketMentions, daremaxxingMentions, dareMentions, foundDares, dareScore, mentionScore };
}

const RANKS = [
  {min:0,    name:'Dare Rookie',    emoji:'🥚'},
  {min:200,  name:'Dare Beginner',  emoji:'🐣'},
  {min:500,  name:'Dare Player',    emoji:'🎮'},
  {min:900,  name:'Dare Challenger',emoji:'⚔️'},
  {min:1400, name:'Dare Hustler',   emoji:'💰'},
  {min:2000, name:'Dare Warrior',   emoji:'🛡️'},
  {min:3000, name:'Dare Addict',    emoji:'🔥'},
  {min:4500, name:'Dare Beast',     emoji:'🦁'},
  {min:6500, name:'Daredevil',      emoji:'😈'},
  {min:9000, name:'Dare Maximus',   emoji:'👑'},
];

function getRank(score) {
  let r = RANKS[0];
  for (const rk of RANKS) if (score >= rk.min) r = rk;
  return r;
}

// In-memory leaderboard
let leaderboard = [];

// ─────────────────────────────────────────────
// API ROUTES
// ─────────────────────────────────────────────
app.get('/api/score/:username', async (req, res) => {
  const username = req.params.username.replace('@', '').trim();
  if (!username) return res.status(400).json({ error: 'Username required' });

  const cached = cache.get(username.toLowerCase());
  if (cached) return res.json({ ...cached, cached: true });

  try {
    // 1. Get X user profile
    const user = await getXUser(username);
    if (!user) return res.status(404).json({ error: 'User not found on X' });

    // 2. Get their tweets (two sources merged)
    const [tweets, dareTweets] = await Promise.all([
      getUserTweets(user.id),
      searchUserDareTweets(username)
    ]);

    // Deduplicate
    const seen = new Set(tweets.map(t => t.id));
    const allTweets = [...tweets, ...dareTweets.filter(t => !seen.has(t.id))];

    // 3. Analyze
    const analysis = analyzeTweets(allTweets);

    // 4. Follower bonus
    const followers = user.public_metrics?.followers_count || 0;
    const followerBonus = Math.min(Math.floor(followers / 100), 500);

    // 5. Final score
    const totalScore = analysis.mentionScore + analysis.dareScore + followerBonus;
    const finalScore = Math.max(totalScore, 10);
    const rank = getRank(finalScore);
    const percentage = Math.min(Math.round((finalScore / 10000) * 100), 100);

    const result = {
      username: user.username,
      displayName: user.name,
      profileImage: user.profile_image_url?.replace('_normal', '_400x400'),
      bio: user.description,
      followers,
      following: user.public_metrics?.following_count || 0,
      tweetCount: user.public_metrics?.tweet_count || 0,
      scannedTweets: allTweets.length,
      score: finalScore,
      percentage,
      rank: rank.name,
      rankEmoji: rank.emoji,
      dareMarketMentions: analysis.dareMarketMentions,
      daremaxxingMentions: analysis.daremaxxingMentions,
      dareMentions: analysis.dareMentions,
      daresFound: analysis.foundDares.sort((a,b) => b.pts - a.pts),
      totalDaresFound: analysis.foundDares.length,
      breakdown: {
        dareMarketScore: analysis.dareMarketMentions * 80,
        daremaxxingScore: analysis.daremaxxingMentions * 120,
        dareMentionScore: Math.min(analysis.dareMentions, 30) * 15,
        daresScore: analysis.dareScore,
        followerBonus
      },
      timestamp: new Date().toISOString()
    };

    cache.set(username.toLowerCase(), result);

    // Update leaderboard
    const idx = leaderboard.findIndex(u => u.username.toLowerCase() === username.toLowerCase());
    const entry = { username: result.username, displayName: result.displayName, score: result.score, percentage, rank: rank.name, rankEmoji: rank.emoji, totalDaresFound: result.totalDaresFound, followers, timestamp: result.timestamp };
    if (idx >= 0) leaderboard[idx] = entry;
    else leaderboard.push(entry);

    res.json(result);

  } catch (err) {
    console.error(err.response?.data || err.message);
    const status = err.response?.status;
    if (status === 404) return res.status(404).json({ error: `X user @${username} not found` });
    if (status === 401) return res.status(401).json({ error: 'X API auth failed — check bearer token in .env' });
    if (status === 429) return res.status(429).json({ error: 'X API rate limit hit. Wait 15 mins and try again.' });
    res.status(500).json({ error: 'Failed: ' + (err.response?.data?.detail || err.message) });
  }
});

app.get('/api/leaderboard', (req, res) => {
  res.json([...leaderboard].sort((a, b) => b.score - a.score));
});

app.get('/api/health', (req, res) => res.json({ ok: true, users: leaderboard.length }));

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('\n');
  console.log('  😈  DAREMAXXING SERVER RUNNING');
  console.log(`  🔥  http://localhost:${PORT}`);
  console.log('  💀  Real X data. Real scores. No faking.');
  console.log('\n');
});
