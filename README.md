# 马铃豆191 视频大合集以及播放器

打开即看 B 站 UP 主 **马铃豆191**（mid 572465432）的主页：头像、签名、等级、粉丝 / 关注 / 投稿数实时同步，162 个视频全部可播，右上角「更多」里有扫码登录、其他视频（搜索 UP 主）、接口设置。

```
index.html                 主页
app.js                     前端逻辑
icon.svg                   图标（马铃豆191 / 粉丝数）
data/snapshot.json         数据快照（Actions 每 30 分钟自动刷新）
worker/worker.js           后端：B 站接口代理（app 签名 + wbi + Cookie + 扫码登录）
server/server.js           同一份后端的 Node 版
scripts/fetch-snapshot.mjs 快照抓取脚本
.github/workflows/pages.yml 自动刷新快照 + 部署 Pages
```

## 已经能用的部分（不用部署后端）

- 主页 + 全部投稿 + 官方播放器（可弹幕/全屏）
- 点赞 / 投币 / 收藏按钮（未登录时提示先登录）
- 粉丝数、关注数随快照刷新（每 30 分钟重建一次页面）

## 需要后端才能做的部分

扫码登录、关注、点赞、投币、收藏、推荐流、收藏夹与历史，都要登录 Cookie，而 B 站接口不带 CORS 头、也不允许第三方站点直接写 Cookie，所以必须有个代理后端：

### A. Cloudflare Worker（免费，推荐）

1. 控制台新建 Worker，把 `worker/worker.js` 全文粘贴进去，部署；
2. 拿到形如 `https://xxx.workers.dev` 的地址；
3. 回到本站，右上角「更多 → 接口设置」填进去，点「保存并连接」。

### B. 本地 / VPS 跑 Node

```bash
node server/server.js        # 默认 8080，PORT=xxxx 可改
```

然后打开 `http://127.0.0.1:8080`，接口会自动走本机，不需要再填地址。

## 接口一览

`/api/ping` `/api/space` `/api/videos` `/api/video` `/api/search/up` `/api/search/video`
`/api/qr/gen` `/api/qr/poll` `/api/nav` `/api/relation` `/api/follow`
`/api/like` `/api/coin` `/api/fav/deal` `/api/fav/list` `/api/fav/items` `/api/rcmd` `/api/history`

## 说明

- 投稿列表走 B 站 app 端接口（appkey 签名），比 web 端 `space/wbi/arc/search` 稳定得多，不会被 412 风控拦住。
- 登录 Cookie 只保存在浏览器的 localStorage，后端只做透传，不落盘。
- 视频版权归 UP 主与 B 站所有。
