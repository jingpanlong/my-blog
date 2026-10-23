---
title: 锦纷资产管理系统：内网 IT 资产盘点怎么做
date: 2026-08-29
description: 一套面向企业 IT 部门的内网设备资产盘点系统，客户端静默采集、Flask 服务端入库 SQLite、pandas 导出 Excel 台账。
tags: ['Python', 'Flask', 'IT运维', '资产盘点']
categories: ['工具']
kicker: '内网工具'
cover: '/img/projects/zcgl-asset/architecture.svg'
---

企业里「设备多、台账散、盘点靠人工」几乎是 IT 部门的通病。**锦纷资产管理系统**就是为解决这个问题而生的一套**内网**设备资产盘点工具——数据不出企业网络，适合设备登记、定期盘点与审计。

<figure>
  <img src="/img/projects/zcgl-asset/architecture.svg" alt="系统架构">
  <figcaption>整体架构：客户端静默采集 → 内网 HTTP 上报 → 服务端写入 SQLite 台账 → pandas 导出 Excel。</figcaption>
</figure>

## 架构分层

系统分两端，全部部署在企业内网：

- **客户端（`client.py`）**：静默采集本机硬件与网络信息，通过内网 HTTP 上报，不打扰使用者；
- **服务端（`server.py`）**：Flask 接收上报，写入 SQLite 的 `assets` 台账表；用 **pandas** 做汇总与 Excel 导出。

「数据不出内网」是这条链路的设计底线——采集到的主机名、IP、使用人等信息只在企业网络内流转。

## 采集哪些字段

一台设备落到台账里的信息包括：

- **硬件**：主机名、操作系统、CPU、内存、磁盘；
- **网络**：MAC 地址、IP；
- **登记**：使用人、部门等管理字段。

这些信息统一进一张台账，盘点时按部门 / 使用人筛选、导出，几秒钟就能出一份完整清单。

## 谁适合用

- 需要定期做固定资产盘点的 IT 部门；
- 希望把「口头报设备」变成「自动采集 + 可审计台账」的团队；
- 对数据出网有合规要求、必须留在内网的环境。

> 说明：作为内部工具，这里不公开内网部署细节与敏感配置，仅分享架构思路与字段设计。

更多见项目卡片 [锦纷资产管理系统](/projects/zcgl-asset/)。
