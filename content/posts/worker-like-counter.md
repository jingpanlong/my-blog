---
title: 用 Cloudflare Worker + KV 做博客点赞统计
date: 2026-10-18
description: 静态博客没有后端也能有全局点赞数：一个 Worker、一个 KV 命名空间，加上「只追加」的计数设计，几十行代码跑通。
tags: ['Cloudflare', 'Serverless', '前端']
categories: ['技术']
kicker: '工程实践'
cover: '/img/covers/cover-indie.jpg'
---

静态站点最尴尬的地方，是「没有后端」。评论可以交给 Giscus，浏览量可以交给 Web Analytics，但**点赞**这种需要写数据的小功能，往往就卡住了。

这篇记录我用 Cloudflare Worker + KV 把它做完的完整思路。

## 为什么不直接读写一个计数器

最直觉的做法是：读 KV 里的 `count`，加一，再写回去。

```js
const n = Number(await LIKES.get('count:' + path)) || 0;
await LIKES.put('count:' + path, String(n + 1));
```

问题在于 KV 是**最终一致**的：写完之后在别的边缘节点不一定立刻可见。两个人同时点赞，很可能都读到 `n = 5`，都写回 `6`，一次点赞就这么丢了。

## 改成「只追加」

既然覆盖写会丢，那就不要覆盖。每次点赞写一个**独立的 key**：

```
like:<path>:<timestamp>:<random>
```

计数时按前缀数 key 的个数：

```js
async function countLikes(path) {
  const prefix = 'like:' + path + ':';
  let total = 0, cursor;
  do {
    const page = await LIKES.list({ prefix, cursor });
    total += (page.keys || []).length;
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return total;
}
```

因为 key 名里带了时间戳和随机数，两次点赞永远不会写到同一个 key 上，并发再高也不会互相覆盖。代价是 key 数量会线性增长，但对个人博客这个量级完全够用。

## Worker 的两个接口

```js
addEventListener('fetch', (event) => {
  event.respondWith(handle(event.request));
});

async function handle(req) {
  const url = new URL(req.url);

  // 允许的站点
  const cors = {
    'Access-Control-Allow-Origin': 'https://my-blog-jingpanlong.pages.dev',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

  if (req.method === 'GET') {
    const path = url.searchParams.get('path') || '/';
    return json({ count: await countLikes(path) }, cors);
  }

  if (req.method === 'POST') {
    const path = await req.text();
    const key = `like:${path}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    await LIKES.put(key, '1');
    return json({ count: await countLikes(path) }, cors);
  }
}
```

`LIKES` 是绑定到 Worker 上的 KV 命名空间，在 `wrangler.toml` 里声明即可。

## 前端只做三件事

1. 进页面 `GET` 一次，把总数显示出来；
2. 点过赞就把路径存进 `localStorage`，按钮置为已赞，不重复提交；
3. 点的时候 `POST` 一次，用返回的 `count` 覆盖显示。

后端不关心「谁」点的，也就没有用户系统和隐私负担。对个人博客来说，这正是想要的效果。

## 踩到的两个坑

- **`workers.dev` 子域没开**：Worker 部署成功但访问报 `error code: 1042`，需要在控制台把 `workers.dev` 路由打开。
- **`curl` 测试计数一直是 0**：不是 Worker 的问题，是 Git Bash 把 `/posts/xxx/` 当成路径改写成了 Windows 本地路径，导致 key 前缀对不上。测试时加上 `MSYS2_ARG_CONV_EXCL='*'` 就好了。

整套东西没有服务器、没有数据库，免费额度绰绰有余。静态博客想要一点「动态」，这大概是最省心的做法。
