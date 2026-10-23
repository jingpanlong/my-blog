---
title: DesktopPet：PySide6 写的可扩展桌面宠物
date: 2026-10-17
description: 基于 PySide6 的桌面宠物，2D 序列帧与 3D（three.js）双模式、AI 聊天、语音播报、自然语言指令、控制中心与插件系统。
tags: ['Python', 'PySide6', '桌面宠物', '3D']
categories: ['工具']
kicker: '桌面伙伴'
cover: '/img/projects/desktop-pet/01-gallery.png'
---

**DesktopPet** 是一个基于 **PySide6** 的桌面宠物应用：橙色系专业主题，既能跑 2D 序列帧桌宠，也能切到 3D 模式，还内置 AI 聊天、语音播报、自然语言指令、控制中心与插件系统。

<figure>
  <img src="/img/projects/desktop-pet/01-gallery.png" alt="宠物图鉴">
  <figcaption>宠物图鉴：每只宠物一套状态动画与外观，切换即生效。</figcaption>
</figure>

## 2D 与 3D 双模式

- **2D 动画**：每只宠物多套状态（idle / happy / sleep / play），帧率独立配置；
- **3D 模式**：用 three.js 渲染，支持导入 `glb / gltf`；没有模型时显示内置小机器人。

<figure>
  <img src="/img/projects/desktop-pet/02-neko.png" alt="2D 猫娘桌宠">
  <figcaption>2D 桌宠：无边框透明窗口，左键拖动、单击互动、双击玩耍、右键菜单。</figcaption>
</figure>

<figure>
  <img src="/img/projects/desktop-pet/03-robot.png" alt="3D 小机器人">
  <figcaption>3D 模式下的内置小机器人，无需外部模型即可体验立体桌宠。</figcaption>
</figure>

## 会动，也有「情绪」

桌宠有**心情 / 体力 / 亲密度**，随时间衰减并持久化，行为按情绪加权——你陪它越多，它越亲近。

<figure>
  <img src="/img/projects/desktop-pet/04-roam.png" alt="桌宠漫游">
  <figcaption>桌宠在屏幕边缘漫游、随机互动，行为受情绪系统影响。</figcaption>
</figure>

## AI 聊天与语音

本地规则对话 + 记忆检索，可选接入 OpenAI 兼容接口；语音用 `QtTextToSpeech` 播报，PowerShell SAPI 兜底。还能听懂自然语言指令。

<figure>
  <img src="/img/projects/desktop-pet/05-greet.png" alt="问候互动">
  <figcaption>单击问候、双击玩耍，配合语音播报更有「存在感」。</figcaption>
</figure>

## 控制中心与插件

控制中心基于 WebEngine + QWebChannel：宠物切换、动作、外观、设置、对话、插件一站式管理。插件只需把 `.py` 文件放进 `plugins/` 并定义 `register(api)` 即可加载。

<figure>
  <img src="/img/projects/desktop-pet/06-dance.png" alt="跳舞动作">
  <figcaption>动作系统支持跳舞等多套表演，配合插件可不断扩展。</figcaption>
</figure>

## 运行

```bash
pip install -r requirements.txt
python main.py
```

要求 **Python 3.9+**，Windows 下体验最完整（开机自启 / 语音 / 托盘），其余平台自动降级。更多见项目卡片 [DesktopPet](/projects/desktop-pet/)。
