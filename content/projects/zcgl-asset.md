---
title: 锦纷资产管理系统
date: 2026-08-28
summary: 企业内网 IT 资产盘点系统：客户端采集设备硬件与网络信息，Flask 服务端入库 SQLite，pandas 导出 Excel 台账。
tags: ['Python', 'Flask', 'IT运维']
categories: ['工具']
icon: '🖥️'
accent: '#6366f1,#818cf8'
status: '内部工具'
link: ''
---

**锦纷资产管理系统**是一套面向企业 IT 部门的内网**设备资产盘点**工具，解决「设备多、台账散、盘点靠人工」的问题。

## 架构

- **客户端（client.py）**：静默采集设备硬件与网络信息，通过内网 HTTP 上报。
- **服务端（server.py）**：Flask 接收上报，写入 SQLite 的 `assets` 台账表；用 pandas 做汇总与 Excel 导出。
- **数据不出内网**：整体部署在企业内网，适合设备登记、盘点与审计。

## 采集字段

主机名、操作系统、CPU、内存、磁盘、MAC / IP 等设备信息，以及使用人、部门等登记信息，统一落到一张台账里。详细设计见配套文章。

> 详细的图文介绍见文章《[锦纷资产管理系统：内网 IT 资产盘点怎么做](/posts/zcgl-asset-intro/)》。
