---
title: 景修 DLL：看清依赖，让修复更有把握
date: 2026-10-24
description: Windows 程序依赖诊断与修复工具。PE 依赖分析、24,099 条离线 DLL 元数据库、官方运行库安装、Windows 系统修复、应用文件备份回滚，一切走官方与可信渠道。
tags: ['C#', 'WPF', 'Windows', '系统工具', 'DLL']
categories: ['项目']
kicker: '系统工具'
cover: /img/posts/jingdll-intro/cover.jpg
---

「缺少 MSVCP140.dll」「找不到 vcruntime140_1.dll」「应用程序无法启动，因为并行配置不正确」——这类提示几乎每个 Windows 用户都遇到过。网上的解决办法通常是：去某个站点下一个 DLL，丢进 System32，注册一下。

问题是：**你并不清楚这个程序到底缺什么、缺哪个架构的、该由谁来提供。** 丢进去的文件可能版本不对、架构不对，甚至本身就不干净。

**景修 DLL（JingDll）** 想做的就是把这件事倒过来：先把依赖关系看清楚，再引导你走**官方渠道**修复。

## 程序依赖诊断：先看清，再动手

打开一个报错的 EXE，工具会读取它的 PE32 / PE32+ 结构，解析两类导入：

- **直接导入**：常规的导入表，逐项核对候选文件、架构、必需导出名称与序号；
- **基于 RVA 的延迟导入**：这类导入在程序运行到特定功能时才真正加载，常规工具经常漏掉，而它会被一并解析。

同时区分目标架构：**x86、x64、ARM64、CLR AnyCPU**。这意味着「你给 x64 程序补了个 x86 的 DLL」这种常见误操作，在诊断阶段就能被发现。

<figure>
  <img src="/img/projects/jingdll/01-修复总览.png" alt="修复总览界面">
  <figcaption>修复总览：数据库条目数、独立名称数、最近诊断疑点、已部署修复记录数，一页看清当前状态。</figcaption>
</figure>

还有一个容易被忽略的细节：**API Set 合约**。现代 Windows 里大量 `api-ms-win-*.dll` 是合约名，并没有同名物理文件。工具不会把这些简单判为「缺失」，避免制造一批假阳性。

## DLL 知识数据库：24,099 条离线元数据

内置 **24,099 条记录、10,158 个独立 DLL 名称**，全部离线可用，支持按名称 / 描述 / 版本检索，也能按架构筛选，匹配结果可导出为 TSV。

<figure>
  <img src="/img/projects/jingdll/02-DLL数据库检索.png" alt="DLL 数据库检索界面">
  <figcaption>知识库检索：输入名称即可查看描述、适用架构与版本信息，无需联网。</figcaption>
</figure>

需要说明的是，这个库是**元数据参考**，不是 DLL 下载站。它的三个来源都写在 README 里：

1. `catalog-reference.tsv`：构建机 Windows 系统目录中实际 PE 文件的名称、架构、FileVersionInfo 与描述，不含任何微软 DLL 二进制；
2. `winbindex-dll-names.txt`：Winbindex 公开数据中 9,652 个 DLL 名称快照，版本与架构明确标注为「未标注」；
3. `Merge-Catalog.ps1`：合并去重，相同名称 / 架构 / 版本不重复计数。

换句话说，它回答的是「这个名字的 DLL 是什么、归谁、有哪些版本」，而不是「点这里下载一个 DLL」。

## 官方运行库：从微软链接装，且验签

MSVCP140 / VCRUNTIME140 这类问题，正确解法是装 **Visual C++ Redistributable**。工具会按程序架构列出 x86 / x64 官方安装包链接，下载后先验证 **Authenticode 签名与 Microsoft Corporation 发布者**，通过才启动安装。

DirectX 与 .NET 也一样——打开对应的微软官方组件下载与版本选择页，由你选择应用实际要求的版本，而不是替你猜。

<figure>
  <img src="/img/projects/jingdll/04-官方运行库.png" alt="官方运行库界面">
  <figcaption>官方运行库：按架构列出微软官方安装包，签名与发布者验证通过后才执行安装。</figcaption>
</figure>

## Windows 修复中心：系统组件损坏

如果问题不在单个程序，而在系统组件本身，工具在 **UAC 提权**后按顺序执行：

```
DISM ScanHealth  →  SFC verifyonly  →  DISM RestoreHealth  →  SFC scannow
```

每一步都有独立实时输出窗口，原始日志和退出码都可查看，方便判断是「查到了但修不了」还是「根本没发现问题」。

<figure>
  <img src="/img/projects/jingdll/05-Windows修复中心.png" alt="Windows 修复中心界面">
  <figcaption>Windows 修复中心：分步执行、实时输出、保留退出码与原始日志。</figcaption>
</figure>

## 可信本地文件修复：有边界感的部署

确实需要从原软件的安装包提取 DLL 时，工具的约束相当克制：

- 只向**用户应用目录**部署「直接导入的同名 DLL」，不碰系统目录；
- 部署前验证架构与导出函数是否匹配；
- **禁止**写入 Windows、Program Files、工具数据目录，以及重解析点（symlink / junction）路径；
- **禁止**替换 KnownDLLs 与 API Set。

配套的**备份与回滚**机制：替换前保存原始文件和 SHA-256，使用临时文件 + 原子替换；如果文件在备份后被外部修改过，会拒绝覆盖回滚，避免把你的改动冲掉。

## 文件详情与日志

选中任意文件可以查看 PE 类型、版本、产品、公司、Authenticode 信任验证、SHA-256、导入模块、导出数量与文本导出。诊断结果可导出 CSV 报告，操作日志可查看与导出，出问题时方便追溯。

<figure>
  <img src="/img/projects/jingdll/03-关于软件与作者.png" alt="关于软件与作者界面">
  <figcaption>关于页面：版本信息、构建说明与项目入口。</figcaption>
</figure>

## 构建方式

不需要 .NET SDK 或 Visual Studio，用 Windows 自带的 .NET Framework C# 编译器即可：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\build.ps1
```

产物是 `dist\JingDll.exe`（单文件便携版）和 `dist\JingDll-Setup.exe`（安装版，含开始菜单入口与卸载登记）。`JingDll.csproj` 也能在装了 .NET Framework 4.8 开发工具的 Visual Studio 里直接打开。

## 一点想法

做这个工具的出发点很简单：**修复类工具的可信度，取决于它有多说清楚自己做了什么。** 所以它宁可多问一句、多验一次签、多禁一个目录，也不愿用一个「看起来修好了」的结果换你下次更大的麻烦。

软件「关于与作者」页内也放了 GitHub 项目入口，可以一键过去下载。如果你也经常被 DLL 报错折腾，可以看看项目卡片 [景修 DLL](/projects/jingdll/)，源码以 GPL-3.0 开源。
