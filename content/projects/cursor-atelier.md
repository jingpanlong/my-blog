---
title: 光标工坊 CursorAtelier
date: 2026-09-10
summary: Windows 鼠标光标美化工具：54 款原创皮肤、17 个角色、CUR/DIB/ANI 编码，支持尺寸、主题、预览与一键恢复。
tags: ['C#', 'WinForms', '个性化']
categories: ['工具']
icon: '🖱️'
accent: '#a855f7,#c084fc'
status: '已发布'
link: ''
---

**光标工坊 / Cursor Atelier** 是一个 Windows 鼠标光标美化工具，用 C# / Windows Forms 实现，不依赖 NuGet 或外部素材。程序内置 **54 款原创皮肤、17 个角色**，由代码生成，随装随用。

## 核心能力

- **皮肤库 / 预览 / 搜索 / 收藏**：按角色系统映射，四档尺寸可选。
- **六套主题配色**，深浅双主题，界面与预览一致。
- **CUR / DIB / ANI 编码与图片导入**：支持自定义光标导入与导出。
- **真实尺寸加载**：`LoadImage(IMAGE_CURSOR)` 按原生像素载入，应用后回读核对，不匹配即回滚。
- **一键恢复**：应用前做注册表快照，退出或恢复时还原系统光标。
- **当前用户安装**，免管理员权限，提供卸载。

> 详细的图文介绍见文章《[光标工坊：把系统光标换成 54 款原创皮肤](/posts/cursor-atelier-intro/)》。
