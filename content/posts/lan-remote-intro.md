---
title: LAN Remote：不联网也能远程控制电脑
date: 2026-09-24
description: 纯局域网远程控制工具，被控端与控制端一体，60FPS 推流、鼠标键盘、传文件、聊天，手机浏览器扫码即控，无需公网。
tags: ['Python', '局域网', '远程控制']
categories: ['工具']
kicker: '桌面工具'
cover: '/img/projects/lan-remote/00-cover.png'
---

远程控制通常意味着：装客户端、注册账号、连厂商服务器。**LAN Remote** 反其道而行——它是**纯局域网**工具，同一个程序既是被控端也是控制端，数据点对点直连，**不走公网、不需要服务器、不需要账号**。

<figure>
  <img src="/img/projects/lan-remote/00-cover.png" alt="LAN Remote 主界面">
  <figcaption>同一程序既是被控端也是控制端，局域网内点对点直连。</figcaption>
</figure>

只要两台设备在同一个路由器下，断网也能用。

## 一键开始与连接

被控端点「开始」，控制端输入对方在同网段显示的地址（或扫二维码）即可连上。提供两种接入方式：

- **密码模式**：临时密码或固定密码；
- **授权模式**：被控端人工点「同意」才放行，更适合临时帮忙。

<figure>
  <img src="/img/projects/lan-remote/01-home.png" alt="主页与控制入口">
  <figcaption>主页同时提供「被控」与「控制」两个入口，切换角色无需重开程序。</figcaption>
</figure>

<figure>
  <img src="/img/projects/lan-remote/02-connect.png" alt="连接过程">
  <figcaption>控制端填入同网段地址或扫码即可建立会话，连接状态实时可见。</figcaption>
</figure>

## 实时屏幕与操作

屏幕推流最高 **60 FPS**，四档画质可调；支持多显示器、一键截图（含框选区域）。鼠标键盘全面接管，组合键、特殊按键都有专用面板。

<figure>
  <img src="/img/projects/lan-remote/03-remote.png" alt="远程操作画面">
  <figcaption>远程画面里直接操作对方屏幕，多显示器可切换，画质随网络自适应。</figcaption>
</figure>

## 文件与聊天

每个目标都是独立会话，自带独立的文件通道和聊天通道。传文件、发消息互不干扰，多设备并发也清晰。

<figure>
  <img src="/img/projects/lan-remote/04-shot.png" alt="截图通道">
  <figcaption>远程过程中可随时框选截图，结果直接落在本机。</figcaption>
</figure>

<figure>
  <img src="/img/projects/lan-remote/05-chat.png" alt="聊天通道">
  <figcaption>每个会话独立的聊天与文件通道，沟通与传输分开管理。</figcaption>
</figure>

## 手机也能控

被控端生成一个二维码 / 链接，用**手机浏览器**打开就是全屏控制端——临时帮家人处理电脑问题，掏出手机扫一下就行。

<figure>
  <img src="/img/projects/lan-remote/06-files.png" alt="手机控制与文件">
  <figcaption>手机浏览器扫码即进入控制端，无需安装 App。</figcaption>
</figure>

源码已开源，详见项目卡片 [LAN Remote](/projects/lan-remote/)。
