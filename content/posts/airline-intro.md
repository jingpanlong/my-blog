---
title: 晾图 Airline：把截图晾在屏幕边上
date: 2026-09-21
description: 一个 Windows 桌面截图小工具，屏幕顶端一根「晾图绳」，截图像照片一样夹在上面，用时展开、离开即收，纯 WPF 实现。
tags: ['WPF', 'Windows', '截图', '效率']
categories: ['工具']
kicker: '桌面工具'
cover: '/img/projects/airline/00-cover.png'
---

截图多了，桌面很快变成「图海」：临时图铺满桌面，想找某张反而更慢。**晾图 / Airline** 的思路不一样——它不在桌面摊开，而是在屏幕**顶端**拉一根「晾图绳」，截图像照片一样夹上去。

<figure>
  <img src="/img/projects/airline/00-cover.png" alt="晾图绳概览">
  <figcaption>屏幕顶端一根晾图绳，截图像照片一样夹在上面，不占桌面空间。</figcaption>
</figure>

它是纯 **WPF** 实现，没有 Electron，没有浏览器壳，体积极小。

## 自动收放

鼠标移到主屏顶端，晾图绳平滑展开；离开约半秒后自动收起，只剩一条细线。平时它几乎不存在，需要时才出现。

<figure>
  <img src="/img/projects/airline/01-rope.png" alt="晾图绳细线状态">
  <figcaption>收起后只留一条细线，不抢注意力；鼠标靠近顶端即展开。</figcaption>
</figure>

截图不设张数上限，按屏宽自动分页。悬挂时图片会轻轻摆动，像真被风吹动；鼠标悬停某张，摆动暂停，方便你看清。

<figure>
  <img src="/img/projects/airline/02-hover.png" alt="悬停查看">
  <figcaption>悬停某张截图会暂停摆动并放大，便于辨认内容。</figcaption>
</figure>

## 截图与收集

- 快捷键 `Ctrl + Alt + S` 直接框选截图；
- Windows 自带的 `Win + Shift + S` 截图，剪贴板里的图会**自动挂上绳**；
- 每张图都能操作：单击复制、长按标注、双击大图预览、拖到其它 App 传 PNG 副本、拖到回收站（可恢复）。

<figure>
  <img src="/img/projects/airline/03-closeup.png" alt="单张截图特写">
  <figcaption>双击可进入大图预览，标注、复制、导出都在右键或长按里完成。</figcaption>
</figure>

## 设置与安装

设置面板可调收放延迟、分页宽度、摆动幅度，并支持开机自启、全屏避让与批量导出。安装版**免管理员权限**。

<figure>
  <img src="/img/projects/airline/04-settings.png" alt="设置面板">
  <figcaption>设置项覆盖了收放行为、外观与导出，整体保持「无感常驻」的设计目标。</figcaption>
</figure>

**无账号、无上传、无遥测**——所有截图只保存在本机 `%LOCALAPPDATA%\Airline\Images`。

更多细节见项目卡片 [晾图 Airline](/projects/airline/)。
