---
title: 一家一菜谱：一家人聚餐前，先在小程序里点好菜
date: 2026-05-13
description: 微信小程序「一家一菜谱」，让一家人聚餐前在手机上一起点菜、自动去重、实时统计预算，技术栈基于微信云开发。
tags: ['微信小程序', '全栈', '云开发', '家庭']
categories: ['产品']
kicker: '微信小程序'
cover: '/img/projects/family-order/04-banner.png'
---

> 注意：这个微信小程序正式名称为 **「一家一菜谱」**（不是「家庭点菜助手」），下文中统一使用正确名称。

一家人聚餐，最怕两件事：点了一堆重复的菜，以及结账时才发现超预算。**一家一菜谱** 就是一个面向家庭聚餐场景的微信小程序，把「点菜」这件事提前到手机上一起完成。

<figure>
  <img src="/img/projects/family-order/04-banner.png" alt="一家一菜谱 banner">
  <figcaption>小程序 banner：家庭聚餐前的点菜与预算协同。</figcaption>
</figure>

## 它解决什么

- **多人同时点菜容易重复**：聚餐前各点各的，到店才发现三份红烧肉；
- **预算不透明**：结账时才知道花了多少，容易超支。

一家一菜谱让家庭成员共享一个菜单，点菜实时同步、自动去重，并按人数与菜品自动估算预算。

## 三个核心页面

小程序主要有三个入口：**首页**负责点菜与菜单总览，**分类**按菜品类型浏览，**我的**管理家庭成员与偏好。

<figure>
  <img src="/img/projects/family-order/01-home.png" alt="首页">
  <figcaption>首页：当前菜单、成员点菜入口与预算概览。</figcaption>
</figure>

<figure>
  <img src="/img/projects/family-order/02-category.png" alt="分类页">
  <figcaption>分类页：按菜品类型浏览，便于快速找到想点的菜。</figcaption>
</figure>

<figure>
  <img src="/img/projects/family-order/03-profile.png" alt="我的页">
  <figcaption>我的：家庭成员、偏好与设置。</figcaption>
</figure>

## 技术实现

技术栈基于**微信云开发（wx.cloud）**：

- 前端使用原生小程序框架；
- 云存储按 `recipes / food-records / avatars / backgrounds` 四类路径组织；
- 跨成员敏感操作通过云函数（如 `manageData`）统一鉴权，绕过数据库权限规则的安全边界。

<figure>
  <img src="/img/projects/family-order/05-banner2.png" alt="第二张 banner">
  <figcaption>另一张运营 banner，用于节日聚餐等场景推广。</figcaption>
</figure>

> 一家一菜谱目前已上线，是家庭聚餐前「先点菜、再赴约」的小帮手。完整能力见项目卡片 [一家一菜谱](/projects/family-order/)。
