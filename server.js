const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const NodeCache = require('node-cache');
const path = require('path');

const app = express();
const cache = new NodeCache({ stdTTL: 600 });
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let leaderboard = [];

const DARES = [
  { id:'solana65k',      kw:['solana 65000','65000 times','65k solana','solana65k'],               pts:2000, diff:'legend',  label:'Solana 65,000 Times' },
  { id:'staring',        kw:['staring contest','stare contest',"don't blink",'dont blink'],         pts:800,  diff:'extreme', label:"Staring Contest" },
  { id:'propose',        kw:['propose to stranger','got down on one knee','marry me stranger'],      pts:700,  diff:'extreme', label:'Ask Stranger to Propose' },
  { id:'urine',          kw:['drink urine','drink my own','drink own urine','drank urine'],          pts:650,  diff:'extreme', label:'Drink Your Own Urine' },
  { id:'goldenshower',   kw:['golden shower','pee on myself','golden dare'],                        pts:600,  diff:'extreme', label:'Golden Shower Dare' },
  { id:'onion',          kw:['raw onion','onion hot sauce','eat onion','onion challenge'],           pts:400,  diff:'hard',    label:'Raw Onion + Hot Sauce' },
  { id:'wasabi',         kw:['tablespoon wasabi','wasabi dare','wasabi challenge','eat wasabi'],     pts:380,  diff:'hard',    label:'Tablespoon of Wasabi' },
  { id:'wax',            kw:['wax armpit','armpit wax','waxed my armpit'],                          pts:350,  diff:'hard',    label:'Wax Your Armpit' },
  { id:'icebath',        kw:['ice bath','icebath','60 second ice','cold water dare'],               pts:340,  diff:'hard',    label:'60-Sec Ice Bath' },
  { id:'nutshot',        kw:['nut shot','trick shot nut','nutshot dare'],                           pts:320,  diff:'hard',    label:'Trick Shot Nut Shot' },
  { id:'mousetrap',      kw:['mouse trap','mousetrap','tongue trap'],                               pts:300,  diff:'hard',    label:'Tongue in a Mousetrap' },
  { id:'lemon',          kw:['lemon juice eye','lemon in eye','squeeze lemon into eye'],            pts:280,  diff:'hard',    label:'Lemon Juice in Eyes' },
  { id:'waterboard',     kw:['waterboard','waterboarded','waterboarding dare'],                     pts:260,  diff:'hard',    label:'Waterboarded for 10 Sec' },
  { id:'cinnamon',       kw:['cinnamon challenge','cinnamon dare','eat cinnamon'],                  pts:150,  diff:'med',     label:'Cinnamon Challenge' },
  { id:'elastic_stomach',kw:['elastic band stomach','rubber band stomach','elastic stomach'],        pts:100,  diff:'easy',    label:'Elastic Band on Stomach' },
  { id:'elastic_back',   kw:['elastic band back','rubber band back','elastic back'],                pts:80,   diff:'easy',    label:'Elastic Band on Back' },
];

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const HEADERS = { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9' };

// ─────────────────────────────────────────────
// SOURCE 1: xcancel.com — clean X mirror
// ─────────────────────────────────────────────
async function scrapeXcancel(username) {
  try {
    const res = await axios.get(`https://xcancel.com/${username}`, { headers: HEADERS, timeout: 10000 });
    const $ = cheerio.load(res.data);
    const tweets = [];
    $('.tweet-content, .timeline-tweet-text, [class*="tweet"] p, .content').each((i, el) => {
      const t = $(el).text().trim();
      if (t.length > 5) tweets.push(t.toLowerCase());
    });
    const displayName = $('title').text().split('(')[0].trim() || username;
    const bio = $('.profile-bio, [class*="bio"]').first().text().trim();
    console.log(`xcancel: ${tweets.length} tweets`);
    return tweets.length > 0 ? { tweets, displayName, bio } : null;
  } catch(e) { console.log('xcancel failed:', e.message); return null; }
}

// ─────────────────────────────────────────────
// SOURCE 2: twstalker.com
// ─────────────────────────────────────────────
async function scrapeTwstalker(username) {
  try {
    const res = await axios.get(`https://twstalker.com/${username}`, { headers: HEADERS, timeout: 10000 });
    const $ = cheerio.load(res.data);
    const tweets = [];
    $('.tweet-text, .tweet p, [class*="tweet-content"], .media-body p').each((i, el) => {
      const t = $(el).text().trim();
      if (t.length > 5) tweets.push(t.toLowerCase());
    });
    const displayName = $('h1, .profile-name, .username').first().text().trim() || username;
    const followers = parseInt(($('[class*="follower"] strong, [class*="follower"] span').first().text().replace(/,/g,'')) || '0') || 0;
    console.log(`twstalker: ${tweets.length} tweets`);
    return tweets.length > 0 ? { tweets, displayName, followers } : null;
  } catch(e) { console.log('twstalker failed:', e.message); return null; }
}

// ─────────────────────────────────────────────
// SOURCE 3: socialblade.com X profile
// ─────────────────────────────────────────────
async function scrapeSocialblade(username) {
  try {
    const res = await axios.get(`https://socialblade.com/twitter/user/${username}`, {
      headers: { ...HEADERS, 'Referer': 'https://socialblade.com' },
      timeout: 10000
    });
    const $ = cheerio.load(res.data);
    let text = '';
    // Socialblade shows stats, not tweets, but good for profile data
    const followers = parseInt(($('#YouTubeUserTopInfoBlockTop, [class*="follower"]').first().text().replace(/,/g,'').match(/\d+/) || ['0'])[0]) || 0;
    const displayName = $('h1, .name, [class*="username"]').first().text().trim() || username;
    text = $('body').text().toLowerCase();
    console.log(`socialblade: got profile data`);
    return { tweets: [], displayName, followers, extraText: text };
  } catch(e) { console.log('socialblade failed:', e.message); return null; }
}

// ─────────────────────────────────────────────
// SOURCE 4: DuckDuckGo — search tweets indexed by Google/DDG
// ─────────────────────────────────────────────
async function searchDDG(username) {
  try {
    const queries = [
      `${username} twitter daremarket OR daremaxxing`,
      `site:x.com ${username} dare`,
    ];
    let allText = '';
    for (const q of queries) {
      try {
        const res = await axios.get(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, { headers: HEADERS, timeout: 10000 });
        const $ = cheerio.load(res.data);
        $('.result__snippet, .result__title').each((i, el) => { allText += ' ' + $(el).text().toLowerCase(); });
        await new Promise(r => setTimeout(r, 600));
      } catch(e) {}
    }
    console.log(`DDG: ${allText.length} chars`);
    return allText;
  } catch(e) { return ''; }
}

// ─────────────────────────────────────────────
// SOURCE 5: twitframe.com (X embed iframes — public)
// ─────────────────────────────────────────────
async function scrapeTwitframe(username) {
  try {
    const res = await axios.get(`https://twitframe.com/show?url=https://twitter.com/${username}`, { headers: HEADERS, timeout: 8000 });
    const $ = cheerio.load(res.data);
    const tweets = [];
    $('p, .tweet-text, span').each((i, el) => {
      const t = $(el).text().trim();
      if (t.length > 10) tweets.push(t.toLowerCase());
    });
    console.log(`twitframe: ${tweets.length} items`);
    return tweets.length > 0 ? { tweets } : null;
  } catch(e) { return null; }
}

// ─────────────────────────────────────────────
// SOURCE 6: Multiple Nitter instances as backup
// ─────────────────────────────────────────────
const NITTERS = ['https://nitter.poast.org','https://nitter.privacydev.net','https://nitter.unixfox.eu','https://nitter.1d4.us','https://nitter.woodland.cafe','https://n.l5.ca','https://nitter.fdn.fr','https://nitter.kavin.rocks'];

async function scrapeNitter(username) {
  for (const host of NITTERS) {
    try {
      const res = await axios.get(`${host}/${username}`, { headers: HEADERS, timeout: 7000, validateStatus: s => s === 200 });
      if (!res.data || res.data.length < 500) continue;
      const $ = cheerio.load(res.data);
      if (!$('.timeline-item, .tweet-content').length) continue;
      const tweets = [];
      $('.tweet-content').each((i, el) => { const t=$(el).text().trim(); if(t) tweets.push(t.toLowerCase()); });
      const displayName = $('.profile-card-fullname').first().text().trim() || username;
      const bio = $('.profile-bio p').first().text().trim();
      const followers = parseInt(($('.followers .profile-stat-num').first().text().replace(/,/g,'')||'0')) || 0;
      const tweetCount = parseInt(($('.tweets .profile-stat-num').first().text().replace(/,/g,'')||'0')) || 0;
      console.log(`✅ Nitter ${host}: ${tweets.length} tweets`);
      return { tweets, displayName, bio, followers, tweetCount };
    } catch(e) { continue; }
  }
  return null;
}

// ─────────────────────────────────────────────
// SCORE ENGINE
// ─────────────────────────────────────────────
function analyze(tweets, extra) {
  const all = tweets.join(' ') + ' ' + (extra||'');
  let dM=0, dX=0, dG=0;
  const found=[], foundIds=new Set();

  for (const t of tweets) {
    if (t.includes('daremarket')||t.includes('@daremarket')||t.includes('dare market')) dM++;
    else if (t.includes('daremaxxing')) dX++;
    else if (t.includes('dare')) dG++;
  }
  // Boost counts from extra text too
  dM = Math.max(dM, Math.floor((all.match(/daremarket|@daremarket/g)||[]).length/2));
  dX = Math.max(dX, Math.floor((all.match(/daremaxxing/g)||[]).length/2));

  for (const dare of DARES) {
    if (foundIds.has(dare.id)) continue;
    for (const kw of dare.kw) {
      if (all.includes(kw)) {
        foundIds.add(dare.id);
        found.push({ label:dare.label, pts:dare.pts, diff:dare.diff, evidence:`Detected: "${kw}"` });
        break;
      }
    }
  }
  return { dM, dX, dG, found };
}

function calcScore(a, followers) {
  const dMS=a.dM*80, dXS=a.dX*120, dGS=Math.min(a.dG,30)*15;
  const dareS=a.found.reduce((s,d)=>s+d.pts,0);
  const fB=Math.min(Math.floor((followers||0)/100),500);
  return { total:Math.max(dMS+dXS+dGS+dareS+fB,10), breakdown:{dareMarketScore:dMS,daremaxxingScore:dXS,dareMentionScore:dGS,daresScore:dareS,followerBonus:fB} };
}

const RANKS=[{min:0,name:'Dare Rookie',emoji:'🥚'},{min:200,name:'Dare Beginner',emoji:'🐣'},{min:500,name:'Dare Player',emoji:'🎮'},{min:900,name:'Dare Challenger',emoji:'⚔️'},{min:1400,name:'Dare Hustler',emoji:'💰'},{min:2000,name:'Dare Warrior',emoji:'🛡️'},{min:3000,name:'Dare Addict',emoji:'🔥'},{min:4500,name:'Dare Beast',emoji:'🦁'},{min:6500,name:'Daredevil',emoji:'😈'},{min:9000,name:'Dare Maximus',emoji:'👑'}];
function getRank(s){let r=RANKS[0];for(const rk of RANKS)if(s>=rk.min)r=rk;return r;}

// ─────────────────────────────────────────────
// MAIN API
// ─────────────────────────────────────────────
app.get('/api/score/:username', async (req, res) => {
  const username = req.params.username.replace('@','').trim();
  if (!username) return res.status(400).json({ error: 'Username required' });

  const cached = cache.get(username.toLowerCase());
  if (cached) return res.json({ ...cached, cached: true });

  console.log(`\n🔍 Scoring @${username} — trying all sources...`);

  // Run ALL sources in parallel
  const [r1,r2,r3,r4,r5,r6] = await Promise.allSettled([
    scrapeXcancel(username),
    scrapeTwstalker(username),
    searchDDG(username),
    scrapeTwitframe(username),
    scrapeNitter(username),
    scrapeSocialblade(username),
  ]);

  let profile = { displayName:username, bio:'', followers:0, tweetCount:0 };
  let allTweets = [];
  let extraText = '';
  let dataFound = false;

  const sources = [
    { name:'xcancel',     r:r1, hasTweets:true  },
    { name:'twstalker',   r:r2, hasTweets:true  },
    { name:'twitframe',   r:r4, hasTweets:true  },
    { name:'nitter',      r:r5, hasTweets:true  },
    { name:'socialblade', r:r6, hasTweets:false },
  ];

  for (const src of sources) {
    if (src.r.status==='fulfilled' && src.r.value) {
      const v = src.r.value;
      if (!dataFound) {
        if (v.displayName) profile.displayName = v.displayName;
        if (v.bio) profile.bio = v.bio;
        if (v.followers) profile.followers = v.followers;
        if (v.tweetCount) profile.tweetCount = v.tweetCount;
      }
      if (src.hasTweets && v.tweets?.length) { allTweets.push(...v.tweets); dataFound = true; }
      if (v.extraText) extraText += ' ' + v.extraText;
    }
  }

  // DDG text
  if (r3.status==='fulfilled' && r3.value?.length > 50) {
    extraText += ' ' + r3.value;
    dataFound = true;
  }

  if (!dataFound) {
    return res.status(404).json({
      error: `Could not find @${username}. Make sure the username is correct and the account is public on X.`
    });
  }

  const uniqueTweets = [...new Set(allTweets)];
  console.log(`✅ Total: ${uniqueTweets.length} tweets, ${extraText.length} extra chars`);

  const analysis = analyze(uniqueTweets, extraText);
  const scored = calcScore(analysis, profile.followers);
  const rank = getRank(scored.total);
  const percentage = Math.min(Math.round((scored.total/10000)*100),100);

  const result = {
    username, displayName:profile.displayName, bio:profile.bio,
    followers:profile.followers, tweetCount:profile.tweetCount,
    scannedTweets:uniqueTweets.length, score:scored.total, percentage,
    rank:rank.name, rankEmoji:rank.emoji,
    dareMarketMentions:analysis.dM, daremaxxingMentions:analysis.dX, dareMentions:analysis.dG,
    daresFound:analysis.found.sort((a,b)=>b.pts-a.pts),
    totalDaresFound:analysis.found.length,
    breakdown:scored.breakdown,
    timestamp:new Date().toISOString()
  };

  cache.set(username.toLowerCase(), result);
  const idx=leaderboard.findIndex(u=>u.username.toLowerCase()===username.toLowerCase());
  const entry={username,displayName:profile.displayName,score:scored.total,percentage,rank:rank.name,rankEmoji:rank.emoji,totalDaresFound:analysis.found.length,followers:profile.followers};
  if(idx>=0)leaderboard[idx]=entry;else leaderboard.push(entry);

  res.json(result);
});

app.get('/api/leaderboard',(req,res)=>res.json([...leaderboard].sort((a,b)=>b.score-a.score)));
app.get('/api/health',(req,res)=>res.json({ok:true,version:'3.2'}));
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));

const PORT=process.env.PORT||3000;
app.listen(PORT,()=>console.log(`\n  😈  DAREMAXXING v3.2 — 6 sources\n  🔥  http://localhost:${PORT}\n`));
