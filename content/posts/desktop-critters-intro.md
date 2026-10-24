---
title: 微野 DesktopCritters：把九种小动物养在桌面上
date: 2026-09-13
lastmod: 2026-10-23T10:04:00+08:00
description: Windows 桌面动物生态，九种昆虫与蜗牛混养，最多 24 只，16 段步态、25–600% 缩放、跨物种互动与生活状态。
tags: ['C#', 'WinForms', '桌面生态', '桌宠']
categories: ['工具']
kicker: '桌面生态'
cover: /img/posts/desktop-critters-intro/cover-ai.jpg
---

如果在桌面上养一窝会爬的小动物会怎样？**微野 3.1** 就是这个问题的答案——把甲虫、瓢虫、蚂蚁、蜜蜂、蝴蝶、蜘蛛、螳螂、蜗牛、毛毛虫九种小动物放到你的桌面上，让它们爬行、觅食、互动。

<figure>
  <img src="/img/projects/desktop-critters/01-preview.png" alt="微野桌面预览">
  <figcaption>多种小动物同时在桌面活动，每种都有独立的行为与步态。</figcaption>
</figure>

## 混养与个体

九种动物每种数量独立，全场**最多 24 只**。每只都能单独配置：名字、50–200% 体型、均衡 / 胆小 / 好斗 / 好奇的性格，以及偏好路线。

## 真实的步态

每种动物用一整张透明**母图**，按距离推进 **16 段步态**——不是简单贴图，而是真的「走」起来。全局缩放支持 **25–600%**，配合多分辨率纹理与 LRU 缓存，放大也不糊。

<figure>
  <img src="/img/projects/desktop-critters/animal-Ant.png" alt="蚂蚁">
  <figcaption>蚂蚁：会沿着桌面图标「搬运」，是九种里最有戏的一位。</figcaption>
</figure>

<figure>
  <img src="/img/projects/desktop-critters/animal-Bee.png" alt="蜜蜂">
  <figcaption>蜜蜂：飞行轨迹更飘，路线和其他爬行类明显不同。</figcaption>
</figure>

<figure>
  <img src="/img/projects/desktop-critters/animal-Butterfly.png" alt="蝴蝶">
  <figcaption>蝴蝶：振翅动画细腻，停驻与飞舞状态切换自然。</figcaption>
</figure>

<figure>
  <img src="/img/projects/desktop-critters/animal-Ladybug.png" alt="瓢虫">
  <figcaption>瓢虫：经典圆润外形，移动节奏舒缓。</figcaption>
</figure>

<figure>
  <img src="/img/projects/desktop-critters/animal-Mantis.png" alt="螳螂">
  <figcaption>螳螂：体型修长，动作带点「捕食者」的警觉感。</figcaption>
</figure>

<figure>
  <img src="/img/projects/desktop-critters/animal-Snail.png" alt="蜗牛">
  <figcaption>蜗牛：慢悠悠的代表，给桌面添一分安静。</figcaption>
</figure>

## 有「生活」的生态

动物不是随机乱动：它们有**饥饿、精力、信任**三种生活状态，食物与互动会影响状态；跨物种会互动、同种会结伴，不同物种按各自习性行动。

还内置场景预设、离屏归来、和平模式；笔记本上**电池模式**会降到 15 FPS，**锁屏**自动暂停，省电又不打扰。

适用 **Windows 10 / 11**，无网络运行依赖。详见项目卡片 [微野 DesktopCritters](/projects/desktop-critters/)。
