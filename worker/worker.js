/**
 * 马铃豆191 视频大合集 · B 站接口代理后端
 * 一份代码同时跑在 Cloudflare Worker 和 Node（server/server.js）。
 * 负责：app 端投稿接口签名、wbi 签名、buvid 指纹、Cookie 透传、
 *       扫码登录、关注、点赞、投币、收藏、推荐、历史、搜索。
 */

const API = 'https://api.bilibili.com';
const PASSPORT = 'https://passport.bilibili.com';
const APP = 'https://app.bilibili.com';
const APPKEY = '1d8b6e7d45233436';
const APPSEC = '560c52ccd288fed045859ed18bffd973';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const APP_UA = 'Mozilla/5.0 (Linux; Android 12; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

/* ---------------- MD5 ---------------- */
const K = new Int32Array(64);
for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296);
const SFT = [7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];

function utf8(str) {
  const out = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0xd800 || c >= 0xe000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else {
      i++;
      const d = 0x10000 + (((c & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff));
      out.push(0xf0 | (d >> 18), 0x80 | ((d >> 12) & 63), 0x80 | ((d >> 6) & 63), 0x80 | (d & 63));
    }
  }
  return out;
}
function md5(str) {
  const bytes = utf8(str);
  const len = bytes.length;
  const words = new Int32Array((((len + 8) >> 6) + 1) * 16);
  for (let i = 0; i < len; i++) words[i >> 2] |= bytes[i] << ((i % 4) * 8);
  words[len >> 2] |= 0x80 << ((len % 4) * 8);
  words[words.length - 2] = len * 8;
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  for (let off = 0; off < words.length; off += 16) {
    let a = a0, b = b0, c = c0, d = d0;
    for (let i = 0; i < 64; i++) {
      let f, g;
      if (i < 16) { f = (b & c) | (~b & d); g = i; }
      else if (i < 32) { f = (d & b) | (~d & c); g = (5 * i + 1) % 16; }
      else if (i < 48) { f = b ^ c ^ d; g = (3 * i + 5) % 16; }
      else { f = c ^ (b | ~d); g = (7 * i) % 16; }
      const tmp = d; d = c; c = b;
      const sum = (a + f + K[i] + words[off + g]) | 0;
      b = (b + ((sum << SFT[i]) | (sum >>> (32 - SFT[i]))) | 0) | 0;
      a = tmp;
    }
    a0 = (a0 + a) | 0; b0 = (b0 + b) | 0; c0 = (c0 + c) | 0; d0 = (d0 + d) | 0;
  }
  const hex = (n) => { let s = ''; for (let i = 0; i < 4; i++) s += ('0' + ((n >> (i * 8)) & 255).toString(16)).slice(-2); return s; };
  return hex(a0) + hex(b0) + hex(c0) + hex(d0);
}

/* ---------------- wbi ---------------- */
const MIXIN = [46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,49,33,9,42,19,29,28,14,39,12,38,41,13,37,48,7,16,24,55,40,61,26,17,0,1,60,51,30,4,22,25,54,21,56,59,6,63,57,62,11,36,20,34,44,52];
const cache = { keys: null, keysTs: 0, buvid: null, buvidTs: 0, read: new Map() };

function cookieStr(obj) { return Object.keys(obj).filter((k) => obj[k]).map((k) => `${k}=${obj[k]}`).join('; '); }
function parseCookie(str = '') { const out = {}; str.split(';').forEach((p) => { const i = p.indexOf('='); if (i > 0) out[p.slice(0, i).trim()] = p.slice(i + 1).trim(); }); return out; }
function encodeQuery(p) {
  return Object.keys(p).filter((k) => p[k] !== undefined && p[k] !== null && p[k] !== '')
    .sort().map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(p[k]))}`).join('&');
}

async function getBuvid() {
  if (cache.buvid && Date.now() - cache.buvidTs < 1800000) return cache.buvid;
  try {
    const r = await fetch(`${API}/x/frontend/finger/spi`, { headers: { 'user-agent': UA, referer: 'https://www.bilibili.com/' } });
    const j = await r.json();
    if (j.code === 0 && j.data && j.data.b_3) cache.buvid = { b3: j.data.b_3, b4: j.data.b_4 };
  } catch (e) {}
  cache.buvidTs = Date.now();
  return cache.buvid;
}

async function getWbiKeys(guest) {
  if (cache.keys && Date.now() - cache.keysTs < 600000) return cache.keys;
  const cookie = cookieStr({ ...guest, b_nut: Math.floor(Date.now() / 1000) });
  const r = await fetch(`${API}/x/web-interface/nav`, { headers: { 'user-agent': UA, referer: 'https://www.bilibili.com/', cookie } });
  const j = await r.json();
  const img = j?.data?.wbi_img?.img_url || '';
  const sub = j?.data?.wbi_img?.sub_url || '';
  if (!img || !sub) throw new Error('wbi key 获取失败');
  cache.keys = { img: img.slice(img.lastIndexOf('/') + 1).split('.')[0], sub: sub.slice(sub.lastIndexOf('/') + 1).split('.')[0] };
  cache.keysTs = Date.now();
  return cache.keys;
}
function signWbi(params, keys) {
  const raw = keys.img + keys.sub;
  const mixin = MIXIN.map((i) => raw[i] || '').join('').slice(0, 32);
  const p = { ...params, wts: Math.floor(Date.now() / 1000) };
  p.w_rid = md5(encodeQuery(p) + mixin);
  return p;
}

/* ---------------- 请求 B 站 ---------------- */
async function bili(path, { params = {}, cookie = '', wbi = false, method = 'GET', host = API, retry = true } = {}) {
  const guest = await getBuvid();
  const user = parseCookie(cookie);
  const fullCookie = cookieStr({ buvid3: user.buvid3 || guest?.b3 || '', buvid4: user.buvid4 || guest?.b4 || '', b_nut: Math.floor(Date.now() / 1000), ...user });
  let query = params;
  if (wbi) { try { query = signWbi(params, await getWbiKeys(guest || {})); } catch (e) { query = params; } }
  const qs = Object.keys(query).length ? '?' + encodeQuery(query) : '';
  let url = host + path, body;
  if (method === 'GET') url += qs; else body = encodeQuery(query);
  const res = await fetch(url, {
    method, body,
    headers: { 'user-agent': UA, referer: 'https://www.bilibili.com/', origin: 'https://www.bilibili.com', accept: 'application/json, text/plain, */*', 'accept-language': 'zh-CN,zh;q=0.9', cookie: fullCookie },
  });
  const text = await res.text();
  let j;
  try { j = JSON.parse(text); } catch (e) { return { code: -999, message: '上游返回非 JSON（可能被风控拦截）', raw: text.slice(0, 80) }; }
  if (retry && [-352, -412, -799].includes(j.code)) { cache.buvid = null; return bili(path, { params, cookie, wbi, method, host, retry: false }); }
  return j;
}

async function biliApp(path, params = {}, cookie = '') {
  const p = { ...params, appkey: APPKEY, ts: Math.floor(Date.now() / 1000) };
  const q = encodeQuery(p);
  p.sign = md5(q + APPSEC);
  const url = APP + path + '?' + encodeQuery(p);
  const guest = await getBuvid();
  const user = parseCookie(cookie);
  const res = await fetch(url, { headers: { 'user-agent': APP_UA, accept: 'application/json', cookie: cookieStr({ buvid3: user.buvid3 || guest?.b3 || '', buvid4: user.buvid4 || guest?.b4 || '', ...user }) } });
  const text = await res.text();
  try { return JSON.parse(text); } catch (e) { return { code: -999, message: 'app 接口返回非 JSON' }; }
}

/* ---------------- 整形 ---------------- */
const num = (v) => (typeof v === 'number' ? v : parseInt(v || 0, 10) || 0);
function fixUrl(u = '') { if (!u) return ''; if (u.startsWith('//')) return 'https:' + u; return u.replace(/^http:/, 'https:'); }
function durText(raw) {
  if (typeof raw === 'number' && raw > 0) return `${Math.floor(raw / 60)}:${String(raw % 60).padStart(2, '0')}`;
  if (typeof raw === 'string' && /^\d+$/.test(raw)) { const n = parseInt(raw, 10); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`; }
  return raw || '';
}
function normVideo(v = {}) {
  const st = v.stat || {};
  return {
    aid: num(v.aid || v.id),
    bvid: v.bvid || v.bv_id || '',
    title: String(v.title || '').replace(/<[^>]+>/g, ''),
    pic: fixUrl(v.pic || v.cover || ''),
    duration: durText(v.duration !== undefined && v.duration !== '' ? v.duration : v.length),
    pubdate: num(v.pubdate || v.created || v.ctime || v.pub_time),
    desc: (v.description || v.desc || '').trim(),
    stat: {
      view: num(v.play ?? st.view), danmaku: num(v.video_review ?? st.danmaku),
      like: num(v.like ?? st.like), coin: num(v.coin ?? st.coin), favorite: num(v.favorite ?? st.favorite), reply: num(v.reply ?? st.reply),
    },
    owner: { mid: num(v.mid || v.owner?.mid), name: v.author || v.owner?.name || '' },
  };
}

/* ---------------- 路由 ---------------- */
const MID_DEFAULT = '572465432';
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}

async function hSpace(q, cookie) {
  const mid = q.get('mid') || MID_DEFAULT;
  const stat = await bili('/x/relation/stat', { params: { vmid: mid }, cookie });
  const navnum = await bili('/x/space/navnum', { params: { mid }, cookie });
  let info = await bili('/x/web-interface/card', { params: { mid, photo: 'false' }, cookie });
  if (info.code !== 0) info = await bili('/x/space/wbi/acc/info', { params: { mid }, cookie, wbi: true });
  if (info.code !== 0) return json({ ok: false, error: info.message || '获取 UP 主信息失败', code: info.code });
  const raw = info.data?.card || info.data || {};
  return json({ ok: true, user: {
    mid: String(mid), name: raw.name || '', face: fixUrl(raw.face || ''), sign: raw.sign || raw.desc || '',
    level: num(raw.level_info?.current_level ?? raw.level),
    fans: num(stat.data?.follower ?? raw.fans), following: num(stat.data?.following ?? raw.friend),
    archiveCount: num(navnum.data?.video) || num(raw.archive_count),
  } });
}

async function hVideos(q, cookie) {
  const mid = q.get('mid') || MID_DEFAULT;
  const pn = q.get('pn') || '1';
  const order = q.get('order') || 'pubdate';
  const keyword = q.get('keyword') || '';
  if (!keyword) {
    const r = await biliApp('/x/v2/space/archive', { vmid: mid, pn: String(pn), ps: '30', mobi_app: 'android', platform: 'android', build: '6190200' }, cookie);
    if (r.code === 0 && r.data?.item?.length) {
      const count = num(r.data.count) || r.data.item.length;
      return json({ ok: true, source: 'app', videos: r.data.item.map((v) => normVideo({ aid: v.param, bvid: v.bvid, title: v.title, pic: v.cover, duration: v.duration, ctime: v.ctime, play: v.play, danmaku: v.danmaku, author: v.author })), page: { pn: num(pn), ps: 20, count, total: Math.max(1, Math.ceil(count / 20)) } });
    }
  }
  let r = await bili('/x/space/wbi/arc/search', { params: { mid, ps: 30, pn, order, keyword, tid: 0, platform: 'web', web_location: 1550101 }, cookie, wbi: true });
  if (r.code !== 0) r = await bili('/x/space/arc/search', { params: { mid, ps: 30, pn, order, keyword, tid: 0 }, cookie });
  if (r.code === 0 && r.data?.list?.vlist) {
    const page = r.data.page || {};
    return json({ ok: true, source: 'arc/search', videos: r.data.list.vlist.map(normVideo), page: { pn: num(pn), ps: 30, count: num(page.count), total: Math.ceil(num(page.count) / 30) || 1 } });
  }
  return json({ ok: false, error: r.message || '视频列表获取失败', code: r.code });
}

async function hVideo(q, cookie) {
  const bvid = q.get('bvid'), aid = q.get('aid');
  if (!bvid && !aid) return json({ ok: false, error: '缺少 bvid/aid' });
  const r = await bili('/x/web-interface/view', { params: bvid ? { bvid } : { aid }, cookie });
  if (r.code !== 0) return json({ ok: false, error: r.message || '获取视频详情失败', code: r.code });
  const d = r.data || {};
  const v = normVideo({ aid: d.aid, bvid: d.bvid, title: d.title, pic: d.pic, duration: d.duration, pubdate: d.pubdate, desc: d.desc, stat: d.stat, owner: d.owner });
  v.pages = num(d.videos);
  return json({ ok: true, video: v });
}

function mapUsers(list = []) {
  return list.map((u) => ({ mid: String(u.mid), name: (u.uname || '').replace(/<[^>]+>/g, ''), face: fixUrl(u.upic || ''), sign: u.usign || '', fans: num(u.fans), videos: num(u.videos), level: num(u.level) }));
}
async function hSearchUp(q, cookie) {
  const keyword = q.get('keyword') || '', page = q.get('page') || '1';
  if (!keyword) return json({ ok: false, error: '缺少 keyword' });
  let r = await bili('/x/web-interface/wbi/search/type', { params: { search_type: 'bili_user', keyword, page, page_size: 20, platform: 'web' }, cookie, wbi: true });
  if (r.code !== 0) r = await bili('/x/web-interface/search/type', { params: { search_type: 'bili_user', keyword, page, page_size: 20 }, cookie });
  if (r.code !== 0) return json({ ok: false, error: r.message || '搜索失败', code: r.code });
  let users = mapUsers(r.data?.result || []);
  if (!users.length && keyword.length > 2) {
    const clean = keyword.replace(/\s+/g, '');
    for (const k of [clean.slice(0, clean.length - 3), clean.slice(0, 2)]) {
      if (k.length < 2) continue;
      const r2 = await bili('/x/web-interface/search/type', { params: { search_type: 'bili_user', keyword: k, page: 1, page_size: 20 }, cookie });
      if (r2.code === 0 && (r2.data?.result || []).length) { users = mapUsers(r2.data.result); break; }
    }
  }
  return json({ ok: true, users, total: users.length });
}
async function hSearchVideo(q, cookie) {
  const keyword = q.get('keyword') || '', page = q.get('page') || '1';
  if (!keyword) return json({ ok: false, error: '缺少 keyword' });
  let r = await bili('/x/web-interface/wbi/search/type', { params: { search_type: 'video', keyword, page, page_size: 20, platform: 'web' }, cookie, wbi: true });
  if (r.code !== 0) r = await bili('/x/web-interface/search/type', { params: { search_type: 'video', keyword, page, page_size: 20 }, cookie });
  if (r.code !== 0) return json({ ok: false, error: r.message || '搜索失败', code: r.code });
  return json({ ok: true, videos: (r.data?.result || []).map((v) => normVideo({ aid: v.aid, bvid: v.bvid, title: v.title, pic: v.pic, duration: v.duration, pubdate: v.pubdate, play: v.play, danmaku: v.video_review, author: v.author, mid: v.mid })), total: num(r.data?.numResults) });
}
async function hRcmd(q, cookie) {
  const ps = q.get('ps') || '12';
  const r = await bili('/x/web-interface/wbi/index/top/feed/rcmd', { params: { ps, fresh_type: 3, feed_version: 'V8', fresh_idx: 1, brush: 0, homepage_ver: 1, platform: 'web' }, cookie, wbi: true });
  if (r.code !== 0) return json({ ok: false, error: r.message || '推荐获取失败', code: r.code });
  return json({ ok: true, videos: (r.data?.item || []).filter((i) => i.bvid).map((v) => normVideo({ aid: v.id, bvid: v.bvid, title: v.title, pic: v.pic, duration: v.duration, pubdate: v.pubdate, stat: v.stat, owner: v.owner })) });
}
async function hHistory(q, cookie) {
  const pn = q.get('pn') || '1';
  const r = await bili('/x/v2/history', { params: { pn, ps: 20, category_id: 0 }, cookie });
  if (r.code !== 0) return json({ ok: false, error: r.message || '历史记录获取失败（需登录）', code: r.code });
  return json({ ok: true, videos: (r.data?.list || []).map((v) => normVideo({ aid: v.aid, bvid: v.bvid, title: v.title, pic: v.cover, duration: v.duration, pubdate: v.view_at || v.pubdate, stat: v.stat, owner: v.owner })) });
}
async function hFavList(q, cookie) {
  const user = parseCookie(cookie);
  const mid = q.get('mid') || user.DedeUserID;
  if (!mid) return json({ ok: false, error: '需要登录' });
  const r = await bili('/x/v3/fav/folder/created/list-all', { params: { up_mid: mid, rid: 0 }, cookie });
  if (r.code !== 0) return json({ ok: false, error: r.message || '收藏夹获取失败', code: r.code });
  return json({ ok: true, folders: (r.data?.list || []).map((f) => ({ id: String(f.id), name: f.title, count: num(f.media_count) })) });
}
async function hFavItems(q, cookie) {
  const mediaId = q.get('media_id'), pn = q.get('pn') || '1';
  if (!mediaId) return json({ ok: false, error: '缺少 media_id' });
  const r = await bili('/x/v3/fav/resource/list', { params: { media_id: mediaId, pn, ps: 20, keyword: '', order: 'mtime', type: 0, tid: 0, platform: 'web' }, cookie });
  if (r.code !== 0) return json({ ok: false, error: r.message || '收藏内容获取失败', code: r.code });
  return json({ ok: true, videos: (r.data?.medias || []).map((m) => normVideo({ aid: m.id, bvid: m.bvid, title: m.title, pic: m.cover, duration: m.duration, pubdate: m.pubtime, play: m.cnt_info?.play, danmaku: m.cnt_info?.danmaku, owner: m.upper })) });
}
async function hQrGen(cookie) {
  const r = await bili('/x/passport-login/web/qrcode/generate', { host: PASSPORT, cookie });
  if (r.code !== 0) return json({ ok: false, error: r.message || '二维码生成失败', code: r.code });
  return json({ ok: true, url: r.data.url, key: r.data.qrcode_key });
}
async function hQrPoll(q, cookie) {
  const key = q.get('key');
  if (!key) return json({ ok: false, error: '缺少 key' });
  const r = await bili('/x/passport-login/web/qrcode/poll', { params: { qrcode_key: key }, host: PASSPORT, cookie });
  const d = r.data || {};
  const out = { ok: true, code: d.code, message: d.message || '' };
  if (d.code === 0 && d.url) {
    const u = new URL(d.url), c = {};
    u.searchParams.forEach((v, k) => { if (['SESSDATA', 'bili_jct', 'DedeUserID', 'DedeUserID__ckMd5', 'sid'].includes(k)) c[k] = v; });
    out.cookie = cookieStr(c);
    out.uid = c.DedeUserID;
  }
  return json(out);
}
async function hNav(q, cookie) {
  const r = await bili('/x/web-interface/nav', { cookie });
  if (r.code !== 0) return json({ ok: false, error: r.message || '未登录', code: r.code });
  return json({ ok: true, isLogin: !!r.data?.isLogin, user: { mid: String(r.data?.mid || ''), name: r.data?.uname || '', face: fixUrl(r.data?.face || ''), level: num(r.data?.level_info?.current_level), coin: r.data?.money ?? 0, vip: r.data?.vipStatus === 1 } });
}
async function hRelation(q, cookie) {
  const fid = q.get('fid');
  if (!fid) return json({ ok: false, error: '缺少 fid' });
  const r = await bili('/x/relation', { params: { fid }, cookie });
  if (r.code !== 0) return json({ ok: false, error: r.message || '关系查询失败', code: r.code });
  return json({ ok: true, attribute: num(r.data?.attribute) });
}

function needLogin(cookie) { const u = parseCookie(cookie); return !u.SESSDATA || !u.bili_jct; }
async function hFollow(body, cookie) {
  if (needLogin(cookie)) return json({ ok: false, error: '未登录', code: -101 });
  const csrf = parseCookie(cookie).bili_jct;
  const r = await bili('/x/relation/modify', { params: { fid: String(body.mid || ''), act: String(body.act ?? 1), re_src: 11, csrf }, cookie, method: 'POST' });
  return json({ ok: r.code === 0, code: r.code, error: r.code === 0 ? '' : r.message || '关注失败' });
}
async function hLike(body, cookie) {
  if (needLogin(cookie)) return json({ ok: false, error: '未登录', code: -101 });
  const csrf = parseCookie(cookie).bili_jct;
  const r = await bili('/x/web-interface/archive/like', { params: { aid: String(body.aid), like: String(body.like ?? 1), csrf }, cookie, method: 'POST' });
  return json({ ok: r.code === 0, code: r.code, error: r.code === 0 ? '' : r.message || '点赞失败' });
}
async function hCoin(body, cookie) {
  if (needLogin(cookie)) return json({ ok: false, error: '未登录', code: -101 });
  const csrf = parseCookie(cookie).bili_jct;
  const r = await bili('/x/web-interface/coin/add', { params: { aid: String(body.aid), multiply: String(body.multiply ?? 1), select_like: '1', cross_domain: 'true', csrf, buvid: (await getBuvid())?.b3 || '' }, cookie, method: 'POST' });
  return json({ ok: r.code === 0, code: r.code, error: r.code === 0 ? '' : r.message || '投币失败' });
}
async function hFav(body, cookie) {
  if (needLogin(cookie)) return json({ ok: false, error: '未登录', code: -101 });
  const csrf = parseCookie(cookie).bili_jct;
  const r = await bili('/x/v3/fav/resource/deal', { params: { rid: String(body.aid), type: '2', add_media_ids: body.add || '', del_media_ids: body.del || '', csrf, platform: 'web' }, cookie, method: 'POST' });
  return json({ ok: r.code === 0, code: r.code, error: r.code === 0 ? '' : r.message || '收藏失败' });
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type,x-bili-cookie',
  'access-control-max-age': '86400',
};

async function route(request) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const q = url.searchParams;
  const cookie = request.headers.get('x-bili-cookie') || '';
  let body = {};
  if (request.method === 'POST') { try { body = await request.json(); } catch (e) {} }
  switch (path) {
    case '/api/ping': return json({ ok: true, service: 'mld191-bili-proxy', time: Date.now() });
    case '/api/space': return hSpace(q, cookie);
    case '/api/videos': return hVideos(q, cookie);
    case '/api/video': return hVideo(q, cookie);
    case '/api/search/up': return hSearchUp(q, cookie);
    case '/api/search/video': return hSearchVideo(q, cookie);
    case '/api/rcmd': return hRcmd(q, cookie);
    case '/api/history': return hHistory(q, cookie);
    case '/api/fav/list': return hFavList(q, cookie);
    case '/api/fav/items': return hFavItems(q, cookie);
    case '/api/qr/gen': return hQrGen(cookie);
    case '/api/qr/poll': return hQrPoll(q, cookie);
    case '/api/nav': return hNav(q, cookie);
    case '/api/relation': return hRelation(q, cookie);
    case '/api/follow': return hFollow(body, cookie);
    case '/api/like': return hLike(body, cookie);
    case '/api/coin': return hCoin(body, cookie);
    case '/api/fav/deal': return hFav(body, cookie);
    default: return json({ ok: false, error: '未知接口: ' + path }, 404);
  }
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const p = new URL(request.url).pathname;
    if (!p.startsWith('/api/')) return json({ ok: true, hint: '这是 B 站接口代理后端，访问 /api/ping 检查' });
    const hasCookie = !!request.headers.get('x-bili-cookie');
    const noCache = hasCookie || /\/api\/(qr|ping|nav|relation)/.test(p);
    const key = request.method === 'GET' && !noCache ? request.url : '';
    if (key && cache.read.has(key)) {
      const hit = cache.read.get(key);
      if (Date.now() - hit.ts < 45000) return new Response(hit.body, { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', ...CORS, 'x-cache': 'hit' } });
      cache.read.delete(key);
    }
    try {
      const res = await route(request);
      const text = await res.text();
      if (key && res.status === 200) {
        if (cache.read.size > 60) cache.read.clear();
        cache.read.set(key, { body: text, ts: Date.now() });
      }
      return new Response(text, { status: res.status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...CORS } });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: String((e && e.message) || e) }), { status: 500, headers: { 'content-type': 'application/json; charset=utf-8', ...CORS } });
    }
  },
};
