---
title: DesktopPet 桌面宠物
date: 2026-10-16
summary: 基于 PySide6 的桌面宠物：2D 序列帧与 3D（three.js）双模式、AI 聊天、语音播报、自然语言指令、控制中心与插件系统。
tags: ['Python', 'PySide6', '桌面宠物']
categories: ['工具']
icon: '🐾'
accent: '#22d3ee,#38bdf8'
status: '开源'
link: ''
---

**DesktopPet** 是一个基于 **PySide6** 的桌面宠物应用：橙色系专业主题，支持 2D 序列帧桌宠、3D 模式、AI 聊天、语音播报、自然语言指令、控制中心、系统托盘与插件系统。

## 模块总览

| 模块 | 功能 |
| --- | --- |
| 桌宠窗口 | 无边框透明、左键拖动、单击互动、双击玩耍、右键菜单 |
| 2D 动画 | 每只宠物多套状态动画（idle / happy / sleep / play），帧率独立配置 |
| 3D 模式 | three.js 渲染，支持导入 glb / gltf，无模型时显示内置小机器人 |
| 情绪系统 | 心情 / 体力 / 亲密度随时间衰减并持久化，行为按情绪加权 |
| AI 聊天 | 本地规则对话 + 记忆检索，可选接入 OpenAI 兼容接口 |
| 语音 | QtTextToSpeech 播报，PowerShell SAPI 兜底 |
| 指令 | 打开程序、创建文件夹、安全删除（二次确认 + 回收区）、系统信息等 |
| 控制中心 | WebEngine + QWebChannel：宠物切换 / 动作 / 外观 / 设置 / 对话 / 插件 |
| 插件 | 放入 `plugins/` 的 `.py` 文件，定义 `register(api)` 即可加载 |

## 运行

```bash
pip install -r requirements.txt
python main.py
```

要求 Python 3.9+，Windows 下体验完整（开机自启 / 语音 / 托盘），其余平台自动降级。

> 详细的图文介绍见文章《[DesktopPet：PySide6 写的可扩展桌面宠物](/posts/desktop-pet-intro/)》。
