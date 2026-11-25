/* 马铃豆191 视频大合集以及播放器 · 前端逻辑 */
(function () {
  "use strict";
  var DEFAULT_MID = "572465432";
  var STORE = { proxy: "mld.proxy", cookie: "mld.cookie", mid: "mld.mid", acts: "mld.acts", follow: "mld.follow" };
  var $ = function (id) { return document.getElementById(id); };
  var S = {
    mid: localStorage.getItem(STORE.mid) || DEFAULT_MID,
    proxy: localStorage.getItem(STORE.proxy) || "",
    me: null, user: null, videos: [], page: 1, totalPage: 1, canMore: false,
    live: false, tab: "video", order: "pubdate", acts: {}, followed: false,
    current: null, qrKey: "", qrTimer: 0, searchType: "up", favFolder: "", loading: false
  };
  S.acts = JSON.parse(localStorage.getItem(STORE.acts) || "{}");

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; }); }
  function fmtNum(n) { n = Number(n || 0); if (n >= 100000000) return (n / 100000000).toFixed(1).replace(/\.0$/, "") + "亿"; if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, "") + "万"; return String(n); }
  function fmtDate(t) { if (!t) return ""; var d = new Date(Number(t) * 1000), now = new Date(), s = (now - d) / 1000; if (s < 60) return "刚刚"; if (s < 3600) return Math.floor(s / 60) + " 分钟前"; if (s < 172800) return Math.floor(s / 3600) + " 小时前"; if (d.getFullYear() === now.getFullYear()) return (d.getMonth() + 1) + "月" + d.getDate() + "日"; return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  var toastTimer;
  function toast(msg) { var t = $("toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove("on"); }, 2400); }
  function openModal(id) { $(id).classList.add("on"); }
  function closeModal(id) { $(id).classList.remove("on"); if (id === "playerModal") $("playerFrame").src = "about:blank"; }
  Array.prototype.forEach.call(document.querySelectorAll("[data-close]"), function (b) { b.onclick = function () { closeModal(b.getAttribute("data-close")); }; });
  Array.prototype.forEach.call(document.querySelectorAll(".modal"), function (m) { m.addEventListener("click", function (e) { if (e.target === m) closeModal(m.id); }); });

  /* ---------- API ---------- */
  function baseUrl() { var p = String(S.proxy || "").trim().replace(/\/+$/, ""); if (!p) return ""; return /\/api$/.test(p) ? p : p + "/api"; }
  function api(path, params, opts) {
    var base = baseUrl();
    if (!base) return Promise.reject(new Error("还没有配置接口后端"));
    var qs = "", parts = [];
    if (params) for (var k in params) if (params[k] !== undefined && params[k] !== null && params[k] !== "") parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(params[k]));
    if (parts.length) qs = "?" + parts.join("&");
    var headers = { accept: "application/json" }, ck = localStorage.getItem(STORE.cookie);
    if (ck) headers["x-bili-cookie"] = ck;
    var init = { method: (opts && opts.method) || "GET", headers: headers, cache: "no-store" };
    if (opts && opts.body) { init.method = "POST"; init.body = JSON.stringify(opts.body); headers["content-type"] = "application/json"; }
    return fetch(base + path + qs, init).then(function (r) {
      return r.json().catch(function () { throw new Error("接口返回异常（HTTP " + r.status + "）"); });
    }).then(function (j) { if (j && j.ok === false) throw new Error(j.error || ("接口错误 " + (j.code || ""))); return j || {}; });
  }
  function pingProxy() {
    var base = baseUrl(); if (!base) return Promise.resolve(false);
    return fetch(base + "/ping", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (j) { return !!(j && j.ok); }).catch(function () { return false; });
  }

  /* ---------- 渲染 ---------- */
  function setLive(on) {
    S.live = on;
    $("liveDot").className = "dot" + (on ? "" : " off");
    $("brandSub").textContent = on ? "实时接口 · 已同步" : (S.proxy ? "接口未连通 · 用快照" : "快照数据 · 可浏览可播放");
    $("srcText").textContent = on ? "实时接口 · 每 60 秒同步" : (S.proxy ? "后端没连通，点我检查" : "快照数据 · 点我接实时接口");
    var d = $("srcPill").querySelector(".dot"); if (d) d.className = "dot" + (on ? "" : " off");
  }
  function renderUser() {
    var u = S.user || {};
    if (u.name) $("upName").textContent = u.name;
    if (u.face) { $("upAvatar").src = u.face; $("upAvatar").onerror = function () { this.src = "./icon.svg"; }; }
    $("upSign").textContent = u.sign || (u.name ? "这位 UP 主很神秘，什么都没写～" : "正在读取 UP 主资料…");
    $("upFansBadge").textContent = (u.fans === undefined ? "—" : fmtNum(u.fans)) + " 粉丝";
    $("stFans").innerHTML = (u.fans === undefined ? "—" : fmtNum(u.fans)) + "<small>人</small>";
    $("stFollow").innerHTML = (u.following === undefined ? "—" : fmtNum(u.following)) + "<small>人</small>";
    var cnt = u.archiveCount || S.videos.length || "—";
    $("stVideos").innerHTML = fmtNum(cnt) + "<small>个</small>";
    if (u.level) { $("upLv").style.display = ""; $("upLv").textContent = "Lv" + u.level; }
    document.title = (u.name || "马铃豆191") + " 视频大合集以及播放器";
    renderFollowBtn();
  }
  function renderFollowBtn() { var b = $("btnFollow"); b.textContent = S.followed ? "已关注" : "+ 关注"; b.className = "btn-follow" + (S.followed ? " on" : ""); }
  function actState(bvid) { if (!S.acts[bvid]) S.acts[bvid] = { like: 0, coin: 0, fav: 0 }; return S.acts[bvid]; }
  function saveActs() { localStorage.setItem(STORE.acts, JSON.stringify(S.acts)); }

  function cardHtml(v) {
    var a = actState(v.bvid);
    return '<div class="thumb"><img loading="lazy" referrerpolicy="no-referrer" src="' + esc(v.pic) + '" alt="">' +
      '<div class="play-ico"><i></i></div>' +
      (v.duration ? '<div class="dur">' + esc(v.duration) + '</div>' : '') +
      '<div class="plays">▶ ' + fmtNum(v.stat && v.stat.view) + '</div></div>' +
      '<div class="meta"><div class="title">' + esc(v.title) + '</div>' +
      '<div class="sub-meta"><span>' + esc(fmtDate(v.pubdate)) + '</span><span>弹幕 ' + fmtNum(v.stat && v.stat.danmaku) + '</span></div>' +
      '<div class="acts">' +
      '<button class="act' + (a.like ? " on" : "") + '" data-k="like">👍 ' + (a.like ? "已赞" : "点赞") + '</button>' +
      '<button class="act' + (a.coin ? " on" : "") + '" data-k="coin">🪙 ' + (a.coin ? "已投" : "投币") + '</button>' +
      '<button class="act' + (a.fav ? " on" : "") + '" data-k="fav">⭐ ' + (a.fav ? "已藏" : "收藏") + '</button>' +
      '</div></div>';
  }
  function renderGrid() {
    var box = $("grid"), list = S.videos || [];
    box.innerHTML = ""; $("loadMoreBox").innerHTML = "";
    if (!list.length) { $("stateBox").innerHTML = '<div class="state"><b>这里还没有视频</b>换个 UP 主，或点下面按钮重建主页。</div>'; $("countTip").textContent = ""; return; }
    $("stateBox").innerHTML = "";
    $("countTip").textContent = "共 " + fmtNum((S.user && S.user.archiveCount) || list.length) + " 个视频" + (S.canMore ? "，已加载 " + list.length : "");
    var frag = document.createDocumentFragment();
    list.forEach(function (v) {
      var card = document.createElement("article"); card.className = "card"; card.innerHTML = cardHtml(v);
      card.addEventListener("click", function (ev) {
        var k = ev.target.getAttribute && ev.target.getAttribute("data-k");
        if (k) { ev.stopPropagation(); doAction(k, v); return; }
        openPlayer(v);
      });
      frag.appendChild(card);
    });
    box.appendChild(frag);
    if (S.tab === "video" && S.canMore) { $("loadMoreBox").innerHTML = '<button class="icon-btn primary" id="btnLoadMore">加载更多视频</button>'; $("btnLoadMore").onclick = loadMore; }
  }

  /* ---------- 数据 ---------- */
  function loadLive() {
    return api("/space", { mid: S.mid }).then(function (j) {
      S.user = j.user || {}; renderUser();
      return api("/videos", { mid: S.mid, pn: 1, order: S.tab === "video" ? S.order : "pubdate" }).then(function (k) {
        S.videos = k.videos || [];
        if (k.page && k.page.count) S.user.archiveCount = k.page.count;
        S.page = 1; S.totalPage = (k.page && k.page.total) || Math.ceil(S.videos.length / 20) || 1;
        S.canMore = S.page < S.totalPage; renderUser(); renderGrid(); return true;
      });
    });
  }
  function loadSnapshot() {
    return fetch("./data/snapshot.json?t=" + Date.now(), { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error("没有快照"); return r.json();
    }).then(function (j) {
      if (j.mid) S.mid = j.mid;
      S.user = j.user || {};
      if (Array.isArray(j.videos) && j.videos.length) { S.videos = j.videos; if (!S.user.archiveCount || S.user.archiveCount < 1) S.user.archiveCount = j.videos.length; }
      S.canMore = false; renderUser(); renderGrid(); return true;
    });
  }
  function loadMore() {
    if (!S.live) { needProxy(); return; }
    if (S.loading) return; S.loading = true;
    var b = $("btnLoadMore"); if (b) { b.textContent = "加载中…"; b.disabled = true; }
    api("/videos", { mid: S.mid, pn: S.page + 1, order: S.order }).then(function (j) {
      var add = (j.videos || []).filter(function (v) { return !S.videos.some(function (x) { return x.bvid === v.bvid; }); });
      S.videos = S.videos.concat(add); S.page += 1;
      S.totalPage = (j.page && j.page.total) || S.totalPage; S.canMore = S.page < S.totalPage;
      S.loading = false; renderGrid();
    }).catch(function (e) { S.loading = false; toast("加载失败：" + e.message); renderGrid(); });
  }
  function needProxy() { toast("要先配接口后端才能用这个功能"); openSettings(); }

  /* ---------- 播放与互动 ---------- */
  function openPlayer(v) {
    S.current = v;
    $("playerTitle").textContent = v.title || "播放";
    $("vidTitle").textContent = v.title || "";
    $("vidMeta").innerHTML = '<span>▶ ' + fmtNum(v.stat && v.stat.view) + ' 播放</span><span>💬 ' + fmtNum(v.stat && v.stat.danmaku) + ' 弹幕</span><span>' + esc(fmtDate(v.pubdate)) + '</span>' + (v.aid ? '<span>av' + v.aid + '</span>' : '');
    $("playerFrame").src = "https://player.bilibili.com/player.html?bvid=" + encodeURIComponent(v.bvid) + "&autoplay=1&high_quality=1&danmaku=1&as_wide=1";
    $("actBili").onclick = function () { window.open("https://www.bilibili.com/video/" + v.bvid, "_blank", "noopener"); };
    refreshBigActs(); openModal("playerModal");
    if (S.live) {
      api("/video", { bvid: v.bvid }).then(function (j) {
        var st = j.video && j.video.stat;
        if (!st || !S.current || S.current.bvid !== v.bvid) return;
        v.stat = st; if (j.video.aid) v.aid = j.video.aid;
        $("vidMeta").innerHTML = '<span>▶ ' + fmtNum(st.view) + ' 播放</span><span>💬 ' + fmtNum(st.danmaku) + ' 弹幕</span><span>👍 ' + fmtNum(st.like) + '</span><span>🪙 ' + fmtNum(st.coin) + '</span><span>⭐ ' + fmtNum(st.favorite) + '</span><span>' + esc(fmtDate(v.pubdate)) + '</span>';
      }).catch(function () { });
    }
  }
  function refreshBigActs() {
    if (!S.current) return; var a = actState(S.current.bvid);
    $("actLike").textContent = a.like ? "👍 已点赞" : "👍 点赞"; $("actLike").className = "big-act" + (a.like ? " on" : "");
    $("actCoin").textContent = a.coin ? "🪙 已投币" : "🪙 投币"; $("actCoin").className = "big-act" + (a.coin ? " on" : "");
    $("actFav").textContent = a.fav ? "⭐ 已收藏" : "⭐ 收藏"; $("actFav").className = "big-act" + (a.fav ? " on" : "");
  }
  $("actLike").onclick = function () { doAction("like", S.current); };
  $("actCoin").onclick = function () { doAction("coin", S.current); };
  $("actFav").onclick = function () { doAction("fav", S.current); };

  function doAction(kind, v) {
    if (!v || !v.aid) { toast("这条视频缺少 aid，无法操作"); return; }
    if (!S.me) { toast("登录后才能" + (kind === "like" ? "点赞" : kind === "coin" ? "投币" : "收藏")); openLogin(); return; }
    if (!S.live) { needProxy(); return; }
    var a = actState(v.bvid);
    if (kind === "like") {
      var next = a.like ? 0 : 1;
      api("/like", null, { method: "POST", body: { aid: v.aid, like: next } }).then(function () {
        a.like = next; saveActs(); toast(next ? "已点赞 ❤️" : "已取消点赞"); renderGrid(); refreshBigActs();
      }).catch(function (e) { toast("点赞失败：" + e.message); });
      return;
    }
    if (kind === "coin") {
      if (a.coin) { toast("已经投过币啦"); return; }
      api("/coin", null, { method: "POST", body: { aid: v.aid, multiply: 1 } }).then(function () {
        a.coin = 1; saveActs(); toast("投币成功 🪙"); renderGrid(); refreshBigActs();
      }).catch(function (e) { toast("投币失败：" + e.message); });
      return;
    }
    if (kind === "fav") {
      if (a.fav) { toast("已经收藏过了"); return; }
      ensureFolder().then(function (fid) { return api("/fav/deal", null, { method: "POST", body: { aid: v.aid, add: fid, del: "" } }); }).then(function () {
        a.fav = 1; saveActs(); toast("收藏成功 ⭐"); renderGrid(); refreshBigActs();
      }).catch(function (e) { toast("收藏失败：" + e.message); });
    }
  }
  function ensureFolder() {
    if (S.favFolder) return Promise.resolve(S.favFolder);
    return api("/fav/list").then(function (j) {
      var f = (j.folders || [])[0]; if (!f) throw new Error("账号里没有默认收藏夹");
      S.favFolder = f.id; return f.id;
    });
  }

  /* ---------- 关注 ---------- */
  function refreshFollow() {
    if (!S.live) { renderFollowBtn(); return; }
    api("/relation", { fid: S.mid }).then(function (j) {
      S.followed = Number(j.attribute) === 2 || Number(j.attribute) === 6; renderFollowBtn();
    }).catch(function () { renderFollowBtn(); });
  }
  $("btnFollow").onclick = function () {
    if (!S.me) { toast("关注需要先扫码登录"); openLogin(); return; }
    if (!S.live) { needProxy(); return; }
    var act = S.followed ? 2 : 1;
    api("/follow", null, { method: "POST", body: { mid: S.mid, act: act } }).then(function () {
      S.followed = act === 1; renderFollowBtn();
      toast(S.followed ? "已关注" : "已取消关注");
      if (S.followed) setTimeout(function () { loadLive(); }, 800);
    }).catch(function (e) { toast("关注失败：" + e.message); });
  };

  /* ---------- 登录 ---------- */
  $("btnAccount").onclick = function () { S.me ? toast("已登录：" + S.me.name) : openLogin(); };
  function openLogin() {
    openModal("loginModal");
    if (S.me) { $("qrCover").classList.add("on"); $("qrCoverText").innerHTML = "已经登录：" + esc(S.me.name) + "<br><span style='font-size:11px;opacity:.8'>要换号请先在「更多 → 退出登录」</span>"; $("qrStatus").textContent = ""; return; }
    if (!S.proxy) {
      $("qrCover").classList.add("on");
      $("qrCoverText").innerHTML = "还没有配置接口后端<br><button class='btn-ghost-sm' id='qrGoSettings' style='margin-top:8px'>去设置</button>";
      var gs = $("qrGoSettings"); if (gs) gs.onclick = function () { closeModal("loginModal"); openSettings(); };
      return;
    }
    newQr();
  }
  function newQr() {
    clearInterval(S.qrTimer);
    $("qrCover").classList.remove("on"); $("qrStatus").textContent = "正在生成二维码…"; $("qrImg").removeAttribute("src");
    api("/qr/gen").then(function (j) {
      S.qrKey = j.key; $("loginLink").value = j.url;
      var providers = [
        function (u) { return "https://api.qrserver.com/v1/create-qr-code/?size=440x440&margin=0&ecc=M&data=" + encodeURIComponent(u); },
        function (u) { return "https://quickchart.io/qr?size=440&margin=0&text=" + encodeURIComponent(u); }
      ];
      var idx = 0;
      $("qrImg").onerror = function () {
        idx += 1;
        if (idx < providers.length) { $("qrImg").src = providers[idx](j.url); return; }
        $("qrCover").classList.add("on");
        $("qrCoverText").innerHTML = "二维码图片没加载出来<br><span style='font-size:11px;opacity:.8'>用下面的登录链接在手机上打开</span>";
        $("linkBox").style.display = "flex";
      };
      $("qrImg").src = providers[0](j.url);
      $("qrStatus").textContent = "等待扫码…"; pollQr();
    }).catch(function (e) { $("qrCover").classList.add("on"); $("qrCoverText").innerHTML = "二维码生成失败<br><span style='font-size:11px;opacity:.8'>" + esc(e.message) + "</span>"; $("qrStatus").textContent = ""; });
  }
  function pollQr() {
    clearInterval(S.qrTimer);
    S.qrTimer = setInterval(function () {
      if (!S.qrKey) return;
      api("/qr/poll", { key: S.qrKey }).then(function (j) {
        var code = Number(j.code);
        if (code === 86101) $("qrStatus").textContent = "等待扫码…";
        else if (code === 86090) $("qrStatus").textContent = "已扫码，请在手机上确认登录";
        else if (code === 86038) { $("qrStatus").textContent = "二维码过期，正在换一张…"; clearInterval(S.qrTimer); setTimeout(newQr, 1200); }
        else if (code === 0 && j.cookie) {
          clearInterval(S.qrTimer); localStorage.setItem(STORE.cookie, j.cookie);
          $("qrStatus").textContent = "登录成功，正在刷新主页…"; toast("登录成功 🎉");
          setTimeout(function () { closeModal("loginModal"); afterLogin(); }, 700);
        }
      }).catch(function (e) { $("qrStatus").textContent = "轮询失败：" + e.message; });
    }, 2000);
  }
  $("qrRefresh").onclick = newQr;
  $("qrCopy").onclick = function () {
    var v = $("loginLink").value;
    if (!v) { toast("还没生成二维码"); return; }
    $("linkBox").style.display = "flex";
    if (navigator.clipboard) navigator.clipboard.writeText(v).then(function () { toast("登录链接已复制"); }).catch(function () { $("loginLink").select(); });
    else $("loginLink").select();
  };
  $("linkOpen").onclick = function () { var v = $("loginLink").value; if (v) window.open(v, "_blank", "noopener"); };

  function afterLogin() {
    api("/nav").then(function (j) {
      if (j.isLogin && j.user) {
        S.me = j.user; $("meName").textContent = j.user.name || "我的账号";
        if (j.user.face) $("meAvatar").src = j.user.face;
        $("menuTip").textContent = "已登录：" + j.user.name + " · 可关注/点赞/投币/收藏";
      }
      loadLive().then(function () { refreshFollow(); switchTab("rcmd", false); });
    }).catch(function () { toast("登录状态读取失败"); });
  }

  /* ---------- 标签页 ---------- */
  Array.prototype.forEach.call(document.querySelectorAll("#tabs .tab"), function (b) { b.onclick = function () { switchTab(b.getAttribute("data-tab"), false); }; });
  function switchTab(tab, silent) {
    S.tab = tab;
    Array.prototype.forEach.call(document.querySelectorAll("#tabs .tab"), function (b) { b.classList.toggle("on", b.getAttribute("data-tab") === tab); });
    $("toolbar").style.display = tab === "video" ? "flex" : "none";
    if (silent) return;
    if (tab === "video") { renderGrid(); return; }
    if (!S.me) {
      $("grid").innerHTML = ""; $("countTip").textContent = ""; $("loadMoreBox").innerHTML = "";
      $("stateBox").innerHTML = '<div class="state"><b>需要登录</b>' + (tab === "rcmd" ? "登录后 B 站会按你的口味推荐视频。" : tab === "fav" ? "登录后才能看到自己的收藏夹和收藏历史。" : "登录后才能同步观看历史。") + '<br><button class="icon-btn primary" id="btnLoginState" style="margin-top:12px">扫码登录</button></div>';
      $("btnLoginState").onclick = openLogin;
      return;
    }
    $("grid").innerHTML = ""; $("loadMoreBox").innerHTML = ""; $("countTip").textContent = "";
    $("stateBox").innerHTML = '<div class="state">正在加载…</div>';
    if (tab === "rcmd") loadRcmd();
    if (tab === "fav") loadFav();
    if (tab === "history") loadHistory();
  }
  function showList(j, label) {
    S.videos = j.videos || []; S.canMore = false;
    $("stateBox").innerHTML = S.videos.length ? "" : '<div class="state"><b>暂时没有内容</b>换个标签试试。</div>';
    $("countTip").textContent = S.videos.length ? label + " " + S.videos.length + " 个" : "";
    S.tab = "list"; renderGrid();
  }
  function loadRcmd() { api("/rcmd", { ps: 18 }).then(function (j) { showList(j, "为你推荐"); }).catch(function (e) { $("stateBox").innerHTML = '<div class="state"><b>推荐加载失败</b>' + esc(e.message) + '</div>'; }); }
  function loadFav() {
    api("/fav/list").then(function (j) {
      var folders = j.folders || [];
      if (!folders.length) { $("stateBox").innerHTML = '<div class="state"><b>没有收藏夹</b>先去 B 站收藏几个视频吧。</div>'; return; }
      var f = folders[0]; S.favFolder = f.id;
      return api("/fav/items", { media_id: f.id, pn: 1 }).then(function (k) { showList(k, "收藏「" + f.name + "」"); });
    }).catch(function (e) { $("stateBox").innerHTML = '<div class="state"><b>收藏加载失败</b>' + esc(e.message) + '</div>'; });
  }
  function loadHistory() { api("/history", { pn: 1 }).then(function (j) { showList(j, "观看历史"); }).catch(function (e) { $("stateBox").innerHTML = '<div class="state"><b>历史加载失败</b>' + esc(e.message) + '</div>'; }); }

  /* ---------- 菜单 / 搜索 / 设置 ---------- */
  $("btnMore").onclick = function (e) { e.stopPropagation(); $("moreMenu").classList.toggle("open"); };
  document.addEventListener("click", function () { $("moreMenu").classList.remove("open"); });
  $("moreMenu").addEventListener("click", function (e) {
    var btn = e.target.closest ? e.target.closest(".menu-item") : null; if (!btn) return;
    var act = btn.getAttribute("data-act"); $("moreMenu").classList.remove("open");
    if (act === "login") openLogin();
    if (act === "other") openOther();
    if (act === "settings") openSettings();
    if (act === "refresh") refreshAll(true);
    if (act === "copy") copyHome();
    if (act === "logout") logout();
  });
  function copyHome() {
    var url = "https://space.bilibili.com/" + S.mid;
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { toast("主页链接已复制：" + url); }).catch(function () { toast(url); });
    else toast(url);
  }
  function logout() {
    localStorage.removeItem(STORE.cookie); localStorage.removeItem(STORE.acts);
    S.me = null; S.acts = {}; S.favFolder = "";
    $("meName").textContent = "登录"; $("meAvatar").src = "./icon.svg";
    $("menuTip").textContent = "登录后可关注、点赞、投币、收藏，并看到推荐与历史。";
    toast("已退出登录"); refreshAll(false);
  }
  function openOther() {
    openModal("otherModal");
    if (!S.proxy) {
      $("searchResult").innerHTML = '<div class="state" style="margin:8px 0">搜索需要接口后端，先点「更多 → 接口设置」连上。<br><button class="btn-ghost-sm" id="goSet2" style="margin-top:8px">去设置</button></div>';
      var g = $("goSet2"); if (g) g.onclick = function () { closeModal("otherModal"); openSettings(); };
    } else $("searchResult").innerHTML = '<div class="state" style="margin:8px 0">输入关键词搜索 UP 主或视频。</div>';
  }
  Array.prototype.forEach.call(document.querySelectorAll(".sub-tab[data-stype]"), function (b) {
    b.onclick = function () {
      S.searchType = b.getAttribute("data-stype");
      Array.prototype.forEach.call(document.querySelectorAll(".sub-tab[data-stype]"), function (x) { x.classList.toggle("on", x === b); });
    };
  });
  $("btnBackHome").onclick = function () {
    S.mid = DEFAULT_MID; localStorage.setItem(STORE.mid, S.mid);
    closeModal("otherModal"); toast("已回到马铃豆191 主页"); refreshAll(false);
  };
  $("btnSearch").onclick = doSearch;
  $("searchInput").onkeydown = function (e) { if (e.key === "Enter") doSearch(); };
  function doSearch() {
    var kw = $("searchInput").value.trim();
    if (!kw) { toast("先输入关键词"); return; }
    if (!S.proxy) { needProxy(); return; }
    var box = $("searchResult");
    box.innerHTML = '<div class="state" style="margin:8px 0">搜索中…</div>';
    if (S.searchType === "up") {
      api("/search/up", { keyword: kw, page: 1 }).then(function (j) {
        var users = j.users || [];
        if (!users.length) { box.innerHTML = '<div class="state" style="margin:8px 0">没有找到相关 UP 主，换个短一点的关键词试试。</div>'; return; }
        box.innerHTML = users.map(function (u, i) {
          return '<div class="up-row" data-i="' + i + '"><img src="' + esc(u.face) + '" referrerpolicy="no-referrer" alt=""><div style="flex:1;min-width:0"><div class="u-name">' + esc(u.name) + '</div><div class="u-sign">' + esc(u.sign || "—") + '</div></div><div class="u-fans">' + fmtNum(u.fans) + ' 粉丝</div></div>';
        }).join("");
        Array.prototype.forEach.call(box.querySelectorAll(".up-row"), function (row) {
          row.onclick = function () {
            var u = users[Number(row.getAttribute("data-i"))];
            S.mid = String(u.mid); localStorage.setItem(STORE.mid, S.mid);
            closeModal("otherModal"); toast("已切换到 " + u.name); refreshAll(false);
          };
        });
      }).catch(function (e) { box.innerHTML = '<div class="state" style="margin:8px 0">搜索失败：' + esc(e.message) + '</div>'; });
    } else {
      api("/search/video", { keyword: kw, page: 1 }).then(function (j) {
        var vs = j.videos || [];
        if (!vs.length) { box.innerHTML = '<div class="state" style="margin:8px 0">没有找到相关视频。</div>'; return; }
        box.innerHTML = '<div class="grid">' + vs.map(cardHtml).join("") + '</div>';
        Array.prototype.forEach.call(box.querySelectorAll(".card"), function (c, i) {
          c.onclick = function (ev) {
            var k = ev.target.getAttribute && ev.target.getAttribute("data-k");
            if (k) { ev.stopPropagation(); doAction(k, vs[i]); return; }
            openPlayer(vs[i]);
          };
        });
      }).catch(function (e) { box.innerHTML = '<div class="state" style="margin:8px 0">搜索失败：' + esc(e.message) + '</div>'; });
    }
  }
  function openSettings() { openModal("settingsModal"); $("proxyInput").value = S.proxy; $("proxyStatus").textContent = ""; }
  $("btnSaveProxy").onclick = function () {
    var v = $("proxyInput").value.trim(); S.proxy = v; localStorage.setItem(STORE.proxy, v);
    $("proxyStatus").textContent = "正在连接…";
    pingProxy().then(function (ok) {
      $("proxyStatus").textContent = ok ? "连接成功，正在刷新主页…" : "没能连上，检查地址或后端是否在运行";
      setLive(ok);
      if (ok) { closeModal("settingsModal"); refreshAll(true); }
    });
  };
  $("btnTestProxy").onclick = function () {
    var v = $("proxyInput").value.trim(); $("proxyStatus").textContent = "正在测试…";
    var base = v ? (/\/api$/.test(v) ? v : v + "/api") : "";
    if (!base) { $("proxyStatus").textContent = "接口地址为空"; return; }
    fetch(base + "/ping", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (j) { $("proxyStatus").textContent = j && j.ok ? "连通 ✅ " + (j.service || "") : "返回异常"; }).catch(function (e) { $("proxyStatus").textContent = "连不上：" + e.message; });
  };
  $("btnClear").onclick = function () {
    localStorage.removeItem(STORE.cookie); localStorage.removeItem(STORE.acts); S.me = null;
    $("meName").textContent = "登录"; toast("已清除登录与操作缓存");
  };

  /* ---------- 初始化 ---------- */
  $("orderSel").onchange = function () {
    S.order = this.value;
    if (S.live) { $("stateBox").innerHTML = '<div class="state">按新顺序重新加载…</div>'; loadLive().then(function () { toast("排序已刷新"); }).catch(function () { toast("排序切换失败，保持原列表"); }); }
    else toast("排序需要接口后端");
  };
  $("btnReload").onclick = function () { refreshAll(true); };
  $("srcPill").onclick = function () { if (S.live) refreshAll(true); else openSettings(); };
  $("btnOpenBili").onclick = function () { window.open("https://space.bilibili.com/" + S.mid, "_blank", "noopener"); };

  function refreshAll(showTip) {
    clearInterval(window.__tick);
    $("grid").innerHTML = ""; $("stateBox").innerHTML = '<div class="state">正在刷新人气数据…</div>';
    pingProxy().then(function (ok) {
      setLive(ok);
      if (ok) {
        loadLive().then(function () {
          refreshFollow(); if (showTip) toast("已刷新");
          window.__tick = setInterval(function () {
            if (!S.live) return;
            api("/space", { mid: S.mid }).then(function (j) {
              var old = S.user || {}; S.user = j.user;
              if (old.fans !== j.user.fans || old.following !== j.user.following) renderUser();
            }).catch(function () { });
          }, 60000);
        }).catch(function (e) {
          $("stateBox").innerHTML = '<div class="state"><b>接口读取失败</b>' + esc(e.message) + '<br>已切回快照数据。</div>';
          setLive(false); loadSnapshot();
        });
      } else {
        loadSnapshot().then(function () { if (showTip) toast("已刷新"); }).catch(function () {
          $("stateBox").innerHTML = '<div class="state"><b>还没有数据</b>接口未连接，仓库里也还没有快照。<br><button class="btn-ghost-sm" id="goSet3" style="margin-top:10px">去配置接口</button></div>';
          var g = $("goSet3"); if (g) g.onclick = openSettings;
        });
      }
    });
  }

  (function boot() { renderFollowBtn(); refreshAll(false); })();
})();
