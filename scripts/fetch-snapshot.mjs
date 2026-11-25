/**
 * 抓取「马铃豆191」主页数据，生成 data/snapshot.json
 * 纯 Node 实现（不依赖后端），GitHub Actions / 本地都能跑：
 *   node scripts/fetch-snapshot.mjs [mid]
 */
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';

const MID = process.argv[2] || process.env.MID || '572465432';
const APPKEY = '1d8b6e7d45233436';
const APPSEC = '560c52ccd288fed045859ed18bffd973';
const UA = 'Mozilla/5.0 (Linux; Android 12; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
const WEB_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function md5(s) {
  return crypto.createHash('md5').update(s).digest('hex');
}

async function getJson(url, headers) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(25000) });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { code: -999, message: '非 JSON 响应', raw: text.slice(0, 100) }; }
}

async function appApi(pathname, params) {
  const p = { ...params, appkey: APPKEY, ts: Math.floor(Date.now() / 1000) };
  const q = Object.keys(p).sort().map((k) => `${k}=${encodeURIComponent(p[k])}`).join('&');
  p.sign = md5(q + APPSEC);
  const url = 'https://app.bilibili.com' + pathname + '?' + Object.keys(p).sort().map((k) => `${k}=${encodeURIComponent(p[k])}`).join('&');
  return getJson(url, { 'user-agent': UA, accept: 'application/json' });
}

async function webApi(pathname, params = {}) {
  const qs = Object.keys(params).map((k) => `${k}=${encodeURIComponent(params[k])}`).join('&');
  const url = 'https://api.bilibili.com' + pathname + (qs ? '?' + qs : '');
  return getJson(url, { 'user-agent': WEB_UA, referer: 'https://space.bilibili.com/', accept: 'application/json' });
}

const num = (v) => (typeof v === 'number' ? v : parseInt(v || 0, 10) || 0);

const card = await webApi('/x/web-interface/card', { mid: MID, photo: 'false' });
const stat = await webApi('/x/relation/stat', { vmid: MID });
const navnum = await webApi('/x/space/navnum', { mid: MID });
const c = card?.data?.card || {};
const user = {
  mid: String(MID),
  name: c.name || '马铃豆191',
  face: (c.face || '').replace(/^http:/, 'https:'),
  sign: c.sign || '',
  level: num(c.level_info?.current_level),
  fans: num(stat?.data?.follower ?? c.fans),
  following: num(stat?.data?.following ?? c.friend),
  archiveCount: num(navnum?.data?.video),
};
console.log('UP 主:', user.name, '粉丝', user.fans, '关注', user.following, '视频', user.archiveCount);

const videos = [];
const seen = new Set();
const pages = Math.max(1, Math.ceil((user.archiveCount || 200) / 20));
for (let pn = 1; pn <= pages; pn++) {
  let r = null;
  for (let i = 0; i < 3; i++) {
    r = await appApi('/x/v2/space/archive', { vmid: MID, pn: String(pn), ps: '30', mobi_app: 'android', platform: 'android', build: '6190200' });
    if (r.code === 0) break;
    console.error('  重试', pn, r.code, r.message);
    await sleep(3000 * (i + 1));
  }
  if (!r || r.code !== 0) break;
  const items = r.data?.item || [];
  if (!items.length) break;
  for (const v of items) {
    if (!v.bvid || seen.has(v.bvid)) continue;
    seen.add(v.bvid);
    const dur = num(v.duration);
    videos.push({
      aid: num(v.param),
      bvid: v.bvid,
      title: String(v.title || '').replace(/<[^>]+>/g, ''),
      pic: (v.cover || '').replace(/^http:/, 'https:'),
      duration: `${Math.floor(dur / 60)}:${String(dur % 60).padStart(2, '0')}`,
      pubdate: num(v.ctime),
      desc: v.subtitle || '',
      stat: { view: num(v.play), danmaku: num(v.danmaku), like: 0, coin: 0, favorite: 0, reply: 0 },
      owner: { mid: num(MID), name: v.author || user.name },
    });
  }
  console.log(`  第 ${pn} 页 -> 累计 ${videos.length} 个`);
  await sleep(1200);
}

if (!videos.length) {
  console.error('没有抓到视频，保留旧快照');
  process.exit(1);
}

const out = {
  updated: Date.now(),
  mid: String(MID),
  user: { ...user, archiveCount: user.archiveCount || videos.length },
  videos,
  source: 'scripts/fetch-snapshot.mjs',
};
const dir = path.resolve('data');
await fs.mkdir(dir, { recursive: true });
await fs.writeFile(path.join(dir, 'snapshot.json'), JSON.stringify(out), 'utf8');
console.log('已写入 data/snapshot.json，共', videos.length, '个视频');
