const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const NodeCache = require('node-cache');
const path = require('path');

const app = express();
const cache = new NodeCache({ stdTTL: 600 }); // 10 min cache

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// In-memory leaderboard
let leaderboard = [];

// ─────────────────────────────────────────────
// DARE DEFINITIONS
// ─────────────────────────────────────────────
const DARES = [
  { id:'solana65k',      kw:['solana 65000','65000 times','65k solana','solana65k','solana 65k'],                                    pts:2000, diff:'legend',  label:'Solana 65,000 Times' },
  { id:'staring',        kw:['staring contest','stare contest','dont blink',"don't blink",'no blink dare'],                          pts:800,  diff:'extreme', label:"Staring Contest (Don't Blink)" },
  { id:'propose',        kw:['propose to stranger','stranger propose','got down on one knee','marry me stranger','proposal dare'],    pts:700,  diff:'extreme', label:'Ask Stranger to Propose' },
  { id:'urine',          kw:['drink urine','drink my own','drink own urine','drank urine','pee dare drink'],                         pts:650,  diff:'extreme', label:'Drink Your Own Urine' },
  { id:'goldenshower',   kw:['golden shower','gold shower','pee on myself','golden dare','peed on myself'],                          pts:600,  diff:'extreme', label:'Golden Shower Dare' },
  { id:'onion',          kw:['raw onion','onion hot sauce','eat onion','onion dare','onion challenge'],                              pts:400,  diff:'hard',    label:'Raw Onion + Hot Sauce' },
  { id:'wasabi',         kw:['tablespoon wasabi','wasabi dare','eat wasabi','wasabi challenge','spoon of wasabi'],                   pts:380,  diff:'hard',    label:'Tablespoon of Wasabi' },
  { id:'wax',            kw:['wax armpit','armpit wax','waxed my armpit','waxing dare','armpit wax dare'],                          pts:350,  diff:'hard',    label:'Wax Your Armpit' },
  { id:'icebath',        kw:['ice bath','60 second ice','icebath','ice bucket dare','cold water dare'],                              pts:340,  diff:'hard',    label:'60-Sec Ice Bath' },
  { id:'nutshot',        kw:['nut shot','trick shot nut','nutshot dare','groin dare','nut dare'],                                    pts:320,  diff:'hard',    label:'Trick Shot Nut Shot' },
  { id:'mousetrap',      kw:['mouse trap','mousetrap','tongue trap','tongue mousetrap','tongue dare'],                               pts:300,  diff:'hard',    label:'Tongue in a Mousetrap' },
  { id:'lemon',          kw:['lemon juice eye','lemon in eye','squeeze lemon into eye','lemon eyes dare'],                          pts:280,  diff:'hard',    label:'Lemon Juice in Eyes' },
  { id:'waterboard',     kw:['waterboard','water board','waterboarded','waterboarding dare'],                                       pts:260,  diff:'hard',    label:'Waterboarded for 10 Sec' },
  { id:'cinnamon',       kw:['cinnamon challenge','cinnamon dare','eat cinnamon','cinnamon spoon','cinnamon spoonful'],              pts:150,  diff:'med',     label:'Cinnamon Challenge' },
  { id:'elastic_stomach',kw:['elastic band stomach','rubber band stomach','band on stomach','elastic stomach'],                      pts:100,  diff:'easy',    label:'Elastic Band on Stomach' },
  { id:'elastic_back',   kw:['elastic band back','rubber band back','band on back','elastic back'],                                 pts:80,   diff:'easy',    label:'Elastic Band on Back' },
];

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
};

// ─────────────────────────────────────────────
// NITTER INSTANCES (public X mirrors, no login needed)
// ─────────────────────────────────────────────
const NITTER_INSTANCES = [
  'https://nitter.poast.org',
  'https://nitter.privacydev.net',
  'https://nitter.unixfox.eu',
  'https://nitter.1d4.us',
];

async function tryNitter(username) {
  for (const instance of NITTER_INSTANCES) {
    try {
      const url = `${instance}/${username}`;
      const res = await axios.get(url, { headers: HEADERS, timeout: 8000 });
      if (res.status === 200 && res.data.includes('tweet')) {
        return { html: res.data, instance };
      }
    } catch (e) {
      continue;
    }
  }
  return null;
}

async function getNitterSearch(username) {
  for (const instance of NITTER_INSTANCES) {
    try {
      const url = `${instance}/search?q=from%3A${username}+dare&f=tweets`;
      const res = await axios.get(url, { headers: HEADERS, timeout: 8000 });
      if (res.status === 200) return res.data;
    } catch (e) {
      continue;
    }
  }
  return null;
}

// ─────────────────────────────────────────────
// SCRAPE USER PROFILE FROM NITTER
// ─────────────────────────────────────────────
function parseNitterProfile(html, username) {
  const $ = cheerio.load(html);

  const displayName = $('.profile-card-fullname').first().text().trim() ||
                      $('title').text().split('/')[0].trim() || username;
  const bio = $('.profile-bio').first().text().trim();
  const followersText = $('.followers .profile-stat-num').first().text().trim().replace(/,/g,'');
  const tweetsText = $('.tweets .profile-stat-num, .profile-stat-num').first().text().trim().replace(/,/g,'');
  const followers = parseInt(followersText) || 0;
  const tweetCount = parseInt(tweetsText) || 0;

  // Extract tweets
  const tweets = [];
  $('.timeline-item, .tweet-content').each((i, el) => {
    const text = $(el).find('.tweet-content, p').text().trim();
    if (text && text.length > 5) tweets.push(text.toLowerCase());
  });

  return { displayName, bio, followers, tweetCount, tweets };
}

// ─────────────────────────────────────────────
// GOOGLE SCRAPE for dare activity
// ─────────────────────────────────────────────
async function googleScrape(username) {
  try {
    const queries = [
      `site:x.com OR site:twitter.com "${username}" dare daremarket`,
      `"@${username}" daremarket OR daremaxxing`,
    ];

    let allText = '';
    for (const q of queries) {
      try {
        const url = `https://www.google.com/search?q=${encodeURIComponent(q)}&num=10`;
        const res = await axios.get(url, { headers: HEADERS, timeout: 7000 });
        const $ = cheerio.load(res.data);
        // Extract snippets
        $('div.VwiC3b, span.st, div.IsZvec, .lyLwlc').each((i, el) => {
          allText += ' ' + $(el).text().toLowerCase();
        });
        await new Promise(r => setTimeout(r, 800)); // small delay between requests
      } catch(e) { continue; }
    }
    return allText;
  } catch(e) {
    return '';
  }
}

// ─────────────────────────────────────────────
// SCORE ANALYZER
// ─────────────────────────────────────────────
function analyzeTweets(tweets, extraText = '') {
  const allText = tweets.join(' ') + ' ' + extraText.toLowerCase();

  let dareMarketMentions = 0;
  let daremaxxingMentions = 0;
  let dareMentions = 0;
  const foundDares = [];
  const foundIds = new Set();

  // Count per tweet for accuracy
  for (const tweet of tweets) {
    if (tweet.includes('daremarket') || tweet.includes('@daremarket') || tweet.includes('dare market')) {
      dareMarketMentions++;
    } else if (tweet.includes('daremaxxing')) {
      daremaxxingMentions++;
    } else if (tweet.includes('dare')) {
      dareMentions++;
    }
  }

  // Also scan extra text for dare market mentions
  const dmMatches = (allText.match(/daremarket|@daremarket|dare market/g) || []).length;
  dareMarketMentions = Math.max(dareMarketMentions, Math.floor(dmMatches / 2));

  const dxMatches = (allText.match(/daremaxxing/g) || []).length;
  daremaxxingMentions = Math.max(daremaxxingMentions, Math.floor(dxMatches / 2));

  // Detect specific dares across all text
  for (const dare of DARES) {
    if (foundIds.has(dare.id)) continue;
    for (const kw of dare.kw) {
      if (allText.includes(kw)) {
        foundIds.add(dare.id);
        foundDares.push({ label: dare.label, pts: dare.pts, diff: dare.diff, evidence: `Detected: "${kw}"` });
        break;
      }
    }
  }

  return { dareMarketMentions, daremaxxingMentions, dareMentions, foundDares };
}

function calcScore(analysis, followers) {
  const followerBonus = Math.min(Math.floor(followers / 100), 500);
  const dareMarketScore = analysis.dareMarketMentions * 80;
  const daremaxxingScore = analysis.daremaxxingMentions * 120;
  const dareMentionScore = Math.min(analysis.dareMentions, 30) * 15;
  const daresScore = analysis.foundDares.reduce((s, d) => s + d.pts, 0);
  const total = Math.max(dareMarketScore + daremaxxingScore + dareMentionScore + daresScore + followerBonus, 10);
  return { total, breakdown: { dareMarketScore, daremaxxingScore, dareMentionScore, daresScore, followerBonus } };
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
function getRank(s) { let r=RANKS[0]; for(const rk of RANKS) if(s>=rk.min) r=rk; return r; }

// ─────────────────────────────────────────────
// API ROUTES
// ─────────────────────────────────────────────
app.get('/api/score/:username', async (req, res) => {
  const username = req.params.username.replace('@','').trim();
  if (!username) return res.status(400).json({ error: 'Username required' });

  const cached = cache.get(username.toLowerCase());
  if (cached) return res.json({ ...cached, cached: true });

  try {
    let profile = { displayName: username, bio: '', followers: 0, tweetCount: 0, tweets: [] };
    let extraText = '';

    // 1. Try Nitter for profile + tweets
    console.log(`Scraping @${username}...`);
    const nitterResult = await tryNitter(username);
    if (nitterResult) {
      profile = parseNitterProfile(nitterResult.html, username);
      console.log(`Got profile: ${profile.displayName}, ${profile.tweets.length} tweets`);
    }

    // 2. Try Nitter search for dare tweets
    const searchHtml = await getNitterSearch(username);
    if (searchHtml) {
      const $ = cheerio.load(searchHtml);
      $('.tweet-content, .timeline-item p').each((i, el) => {
        const t = $(el).text().trim().toLowerCase();
        if (t) profile.tweets.push(t);
      });
    }

    // 3. Google scrape for additional dare evidence
    extraText = await googleScrape(username);

    // 4. If no profile found at all
    if (!nitterResult && !extraText) {
      return res.status(404).json({ error: `@${username} not found or profile is private` });
    }

    // 5. Analyze everything
    const analysis = analyzeTweets(profile.tweets, extraText);
    const scored = calcScore(analysis, profile.followers);
    const rank = getRank(scored.total);
    const percentage = Math.min(Math.round((scored.total / 10000) * 100), 100);

    const result = {
      username,
      displayName: profile.displayName || username,
      bio: profile.bio || '',
      followers: profile.followers,
      tweetCount: profile.tweetCount,
      scannedTweets: profile.tweets.length,
      score: scored.total,
      percentage,
      rank: rank.name,
      rankEmoji: rank.emoji,
      dareMarketMentions: analysis.dareMarketMentions,
      daremaxxingMentions: analysis.daremaxxingMentions,
      dareMentions: analysis.dareMentions,
      daresFound: analysis.foundDares.sort((a,b)=>b.pts-a.pts),
      totalDaresFound: analysis.foundDares.length,
      breakdown: scored.breakdown,
      timestamp: new Date().toISOString()
    };

    cache.set(username.toLowerCase(), result);

    // Update leaderboard
    const idx = leaderboard.findIndex(u => u.username.toLowerCase() === username.toLowerCase());
    const entry = { username: result.username, displayName: result.displayName, score: result.score, percentage, rank: rank.name, rankEmoji: rank.emoji, totalDaresFound: result.totalDaresFound, followers: result.followers, timestamp: result.timestamp };
    if (idx >= 0) leaderboard[idx] = entry;
    else leaderboard.push(entry);

    res.json(result);

  } catch (err) {
    console.error('Score error:', err.message);
    res.status(500).json({ error: 'Scraping failed: ' + err.message });
  }
});

app.get('/api/leaderboard', (req, res) => {
  res.json([...leaderboard].sort((a, b) => b.score - a.score));
});

app.get('/api/health', (req, res) => res.json({ ok: true, users: leaderboard.length, version: '3.0-free' }));

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('\n');
  console.log('  😈  DAREMAXXING v3.0 — 100% FREE');
  console.log(`  🔥  http://localhost:${PORT}`);
  console.log('  💀  No API keys. No credits. Pure scraping.');
  console.log('\n');
});
