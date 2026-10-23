---
title: 流转 FlowShift：把「转格式」变成一次拖拽
date: 2026-10-02
lastmod: 2026-10-23T10:08:00+08:00
description: 一款常驻桌面的 Windows 本地格式转换工具，悬浮胶囊 + 格式罗盘 + 资源管理器右键，255 种格式一切在本地完成。
tags: ['C#', 'Windows', '效率工具', '格式转换']
categories: ['工具']
kicker: '桌面工具'
cover: '/img/projects/flowshift/01-expanded.png'
---

「转个格式」这种事，本不该打开一个庞大的网站、等待上传、再等下载。**FlowShift** 想做的，是把这件事压缩成「拖进来 → 点一下 → 完成」。

它是一个常驻桌面的轻量悬浮胶囊，用 C# 写成，转换内核复用开源项目 **Filee（MIT）**，所有文件都在你本机处理，不上传、不留痕。

## 贴边悬浮胶囊

启动后屏幕上多出一个浅色小胶囊。把文件拖上去，它会就地展开成一张操作面板：左边是原文件，右边是目标格式网格。

<figure>
  <img src="/img/projects/flowshift/01-expanded.png" alt="FlowShift 展开后的悬浮面板">
  <figcaption>拖入文件后就地展开：左侧源文件，右侧目标格式网格，进度与结果都留在悬浮层。</figcaption>
</figure>

把胶囊拖到屏幕四边，它会自动收成一条薄薄的标签，不挡内容；位置会被记住，下次打开还在老地方。

## 格式罗盘：长按右键选格式

这是我最喜欢的交互。在资源管理器里选中文件，**长按右键约 650 毫秒**，会唤出一个环形「格式罗盘」，指针指向哪种格式，松开就转成那种。

<figure>
  <img src="/img/projects/flowshift/02-wheel.png" alt="格式罗盘">
  <figcaption>长按右键唤出的格式罗盘：指向即所选，松开即转换，全程不离开当前窗口。</figcaption>
</figure>

也可以通过快捷键直接呼出罗盘，手不离键盘就能完成转换。

## 资源管理器右键

不想记手势也没关系。右键文件，菜单里多了「**流转 · 转换格式**」，常用格式直接列出，更多格式走「选择其他格式」。

<figure>
  <img src="/img/projects/flowshift/03-result.png" alt="转换结果">
  <figcaption>转换完成后在原处生成结果文件，进度、取消、结果与引擎安装都在同一面板里完成。</figcaption>
</figure>

## 255 种格式与本地优先

FlowShift 内置 **255 种真实文件格式定义**，覆盖文档、图片、音视频、压缩包等。不同格式之间有只读 / 只写 / 依赖差异，工具会如实提示哪些能转、哪些需要先装引擎。

<figure>
  <img src="/img/projects/flowshift/05-setup.png" alt="设置与引擎">
  <figcaption>设置面板里可以管理格式引擎、批量参数与快捷键，所有转换默认在本地完成。</figcaption>
</figure>

> 一句话总结：**一切在本地完成**——文件不上传，原件保留，转换记录只属于你。

如果你也受够了「为了转个图特地开网页」，可以看看项目卡片 [流转 FlowShift](/projects/flowshift/)，源码已在 GitHub 开源。
