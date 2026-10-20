---
title: 用 Hugo + Cloudflare Pages 搭建个人博客
date: 2026-10-19
description: 记录我是如何用 Hugo 生成静态站、Cloudflare Pages 免费托管，并把整套流程跑通的。
tags: ['Hugo', '博客', 'Cloudflare']
categories: ['技术']
kicker: '技术实践'
cover: '/img/covers/cover-efficiency.jpg'
---

这次把个人博客搬到了 **Hugo + Cloudflare Pages** 的组合上。

## 为什么选这套

- **Hugo**：Go 写的静态站点生成器，构建飞快，主题/模板可控。
- **Cloudflare Pages**：免费托管静态站，全球 CDN，绑定自己域名也方便。
- **GitHub**：源码版本管理，历史清晰。

## 流程

1. 本地 `hugo new site` 初始化，写好文章。
2. 构建出 `public/` 静态文件。
3. 通过 Cloudflare Pages Direct Upload 把 `public/` 推上线。
4. 自定义玻璃拟态主题，做出想要的视觉。

部署脚本跑一次就能重新上线，改文章 → 构建 → 部署，几分钟搞定。
