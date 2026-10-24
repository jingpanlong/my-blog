---
title: 景修 DLL
date: 2026-10-24
summary: Windows 程序依赖诊断与修复工具：PE 依赖分析、24,099 条离线 DLL 元数据库、官方运行库安装、Windows 系统修复、应用文件备份回滚。
tags: ['C#', 'WPF', 'Windows', '系统工具']
categories: ['工具']
icon: '🧩'
accent: '#0ea5e9,#38bdf8'
status: '已开源'
link: 'https://github.com/jingpanlong/JingDll'
---

**景修 DLL（JingDll）** 是一款 Windows 程序**依赖诊断与修复**工具。当软件因为缺少 DLL、文件异常或架构 / 函数版本不兼容而打不开时，它先把依赖关系看清楚，再引导你走**官方渠道**稳妥修复——而不是从来历不明的站点抓一个 DLL 往系统目录里扔。

- **程序依赖诊断**：解析 EXE / DLL 的 PE32 / PE32+，覆盖直接导入与基于 RVA 的延迟导入，区分 x86、x64、ARM64、CLR AnyCPU。
- **DLL 知识数据库**：24,099 条离线记录、10,158 个独立 DLL 名称，支持名称 / 描述 / 版本检索与架构筛选。
- **官方运行库**：按需下载微软官方 Visual C++ v14 安装包，验证 Authenticode 签名与发布者后才启动安装。
- **Windows 修复中心**：UAC 提权后执行 DISM ScanHealth、SFC verifyonly、DISM RestoreHealth 后接 SFC scannow，独立输出窗口与原始日志。
- **可信本地文件修复 + 备份回滚**：只向用户应用目录部署同名 DLL，替换前保存原文件与 SHA-256，可随时回滚。

> 详细的图文介绍见文章《[景修 DLL：看清依赖，让修复更有把握](/posts/jingdll-intro/)》。
