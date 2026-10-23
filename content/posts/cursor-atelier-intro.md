---
title: 光标工坊 CursorAtelier：把系统光标换成 54 款原创皮肤
date: 2026-09-11
lastmod: 2026-10-23T10:03:00+08:00
description: Windows 鼠标光标美化工具，54 款原创皮肤、17 个角色、CUR/DIB/ANI 编码，支持尺寸、主题、预览与一键恢复。
tags: ['C#', 'WinForms', '个性化', '光标']
categories: ['工具']
kicker: '桌面美化'
cover: '/img/projects/cursor-atelier/01-main.png'
---

系统那个白色箭头看腻了吗？**光标工坊 / Cursor Atelier** 是一个用 C# / Windows Forms 写的光标美化工具，不依赖 NuGet 或外部素材，程序内置 **54 款原创皮肤、17 个角色**，打开就能用。

<figure>
  <img src="/img/projects/cursor-atelier/01-main.png" alt="光标工坊主界面">
  <figcaption>主界面即皮肤库，左侧角色、右侧预览，点一下即可应用。</figcaption>
</figure>

## 皮肤库与预览

所有皮肤按角色系统组织，支持搜索、收藏。每个皮肤都能在列表里直接预览动态效果（含 ANI 动画光标），选中后还有大图预览。

<figure>
  <img src="/img/projects/cursor-atelier/02-themes.png" alt="主题与配色">
  <figcaption>六套主题配色，深浅双主题，界面与光标预览保持一致。</figcaption>
</figure>

<figure>
  <img src="/img/projects/cursor-atelier/03-skins.png" alt="皮肤列表">
  <figcaption>54 款皮肤按角色排列，搜索与收藏让常用皮肤一键可达。</figcaption>
</figure>

## 不只是换皮

- **四档尺寸**：小屏到大屏都能找到顺手的指针大小；
- **CUR / DIB / ANI 编码**：原生支持静态、位图与动画光标；
- **图片导入**：可以把自己的图片做成光标导入导出；
- **真实尺寸加载**：通过 `LoadImage(IMAGE_CURSOR)` 按原生像素载入，应用后回读核对，不匹配立即回滚，避免「看着对、实际糊」。

<figure>
  <img src="/img/projects/cursor-atelier/04-fun.png" alt="趣味皮肤">
  <figcaption>趣味角色皮肤，让日常点击变得不那么无聊。</figcaption>
</figure>

<figure>
  <img src="/img/projects/cursor-atelier/05-sizes.png" alt="尺寸选择">
  <figcaption>四档尺寸实时预览，挑选最跟手的大小。</figcaption>
</figure>

## 一键恢复，绝不搞坏系统

应用前会自动做**注册表快照**，退出或主动「恢复」时还原系统光标，不用担心换不回来。支持**当前用户安装**，免管理员权限，并提供卸载。

<figure>
  <img src="/img/projects/cursor-atelier/06-import.png" alt="导入与恢复">
  <figcaption>导入自定义光标、导出皮肤，以及一键恢复系统默认光标。</figcaption>
</figure>

详见项目卡片 [光标工坊 CursorAtelier](/projects/cursor-atelier/)。
