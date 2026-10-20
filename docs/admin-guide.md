# 博客后台使用指南

本文档说明个人博客管理后台（Decap CMS）的完整搭建流程与日常使用方法。

---

## 一、这是什么

博客后台是一个网页版内容管理界面，地址：

```
https://my-blog-jingpanlong.pages.dev/admin/
```

在里面可以：

- **发布 / 编辑文章**（标题、摘要、专栏、标签、封面图、正文）
- **管理项目**（项目名、简介、技术标签、状态、图标、主题色）
- **编辑「关于我」页面**
- **修改站点资料**（名字、头像、简介、座右铭、社交链接、知识地图节点……）

所有改动都通过 **GitHub 提交 → 自动构建 → 自动上线** 完成，不需要动代码、不需要 FTP。

---

## 二、整体工作流程

```
在 /admin/ 里写内容
      │
      ▼
点击「发布」→ 后台把改动提交到 GitHub（生成 Pull Request）
      │
      ▼
到 GitHub 合并这个 PR
      │
      ▼
GitHub Actions 自动运行 Hugo 构建
      │
      ▼
自动部署到 Cloudflare Pages
      │
      ▼
https://my-blog-jingpanlong.pages.dev 更新完成（约 1～2 分钟）
```

> 草稿状态下不会影响线上——草稿保存在独立分支上，只有合并 PR 后才会进入生产构建。

---

## 三、首次搭建（只需做一次）

后台依赖三个部件，前两个已经由开发侧完成，**最后两步需要你本人在 GitHub 上操作**。

### 已完成的部分

| 部件 | 状态 | 说明 |
| --- | --- | --- |
| 后台页面 `/admin/` | ✅ 已上线 | Decap CMS，含文章 / 项目 / 页面 / 站点设置四个模块 |
| GitHub OAuth 代理 | ✅ 已上线 | `https://blog-oauth.470918507.workers.dev`，负责「使用 GitHub 登录」 |
| 自动部署工作流 | ✅ 已就绪 | `.github/workflows/deploy.yml`，push 到 main 即自动构建部署 |

### 需要你操作的 Step 1：创建 GitHub OAuth App

1. 打开 <https://github.com/settings/developers>
2. 点 **OAuth Apps** → **New OAuth App**
3. 填写：

   | 字段 | 值 |
   | --- | --- |
   | Application name | `博客后台`（随意） |
   | Homepage URL | `https://my-blog-jingpanlong.pages.dev` |
   | Authorization callback URL | `https://blog-oauth.470918507.workers.dev/callback` |

4. 点 **Register application**
5. 在应用详情页复制 **Client ID**
6. 点 **Generate a new client secret**，复制 **Client Secret**（只显示一次，请立即保存）

### 需要你操作的 Step 2：把凭证交给部署脚本

把上一步拿到的两个值告诉我（或自行执行），运行：

```bash
cd 搭建个人博客
CF_ACCOUNT_ID=5603fe1ec996bc368facda2190cdcfd2 \
CF_API_TOKEN=<你的 Cloudflare Token> \
GH_CLIENT_ID=<Client ID> \
GH_CLIENT_SECRET=<Client Secret> \
python ../tools/deploy_oauth_worker.py
```

看到 `[health] "ok": true` 即表示登录通道打通。

### 需要你操作的 Step 3：给仓库添加部署密钥

打开 <https://github.com/jingpanlong/my-blog/settings/secrets/actions>

点 **New repository secret**，添加两条：

| Name | Value |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | 你的 Cloudflare API Token（需含 **Cloudflare Pages:Edit** 权限） |
| `CLOUDFLARE_ACCOUNT_ID` | `5603fe1ec996bc368facda2190cdcfd2` |

添加完成后，到 <https://github.com/jingpanlong/my-blog/actions> 点 **Re-run jobs** 跑一次部署，即可验证全链路。

---

## 四、日常使用

### 登录

打开 `https://my-blog-jingpanlong.pages.dev/admin/` → 点 **使用 GitHub 登录** → 在弹出的窗口里授权。

> 第一次登录会跳转到 GitHub 授权页，点绿色按钮即可。之后在同一浏览器里保持登录状态。

### 发一篇文章

1. 左侧点 **文章** → 右上 **新建文章**
2. 填字段：

   | 字段 | 说明 |
   | --- | --- |
   | 标题 | 文章标题 |
   | 摘要 | 首页卡片上的一行简介，建议 40 字内 |
   | 发布时间 | 默认当前时间 |
   | 专栏 | 封面图左上角的角标（技术思考 / 技术实践 / 设计思考 / 效率工具 / 产品思考 / 生活随笔 / 工程实践） |
   | 标签 | 回车分隔，如 `Hugo` `Cloudflare` |
   | 封面图 | 从媒体库选或上传；留空则首页文章卡不显示封面 |
   | 正文 | Markdown 编辑器 |

3. 右上角 **保存**（此时是草稿，线上看不到）
4. 确认无误后点 **发布** → 弹出提示会给出一个 GitHub PR 链接
5. 打开该链接，点 **Merge pull request** → **Confirm merge**
6. 等 1～2 分钟，刷新博客首页即可看到新文章

### 改站点资料

左侧 **站点设置** → **个人资料与站点**，可以改：

- 名字、Logo 字样、Logo 下方标语
- Hero 区副标题与正文、右侧竖排标语
- 侧栏简介、身份标签、座右铭、头像
- 页脚副标题、SEO 描述
- 社交链接（GitHub / 邮箱 / 微信 / 小红书 / B 站 / RSS）
- **知识地图节点**（首页围绕星球排列的 5 个节点，含标题、描述、颜色）

改完同样走「保存 → 发布 → 合并 PR」流程。

### 传图片

编辑器里的图片字段（封面图）右侧有 **Choose an image**，可以上传。上传的文件会进到仓库的 `static/img/uploads/`，并在站点上以 `/img/uploads/xxx` 提供访问。

---

## 五、常见问题

**Q：点了发布，网站上没变化？**
A：「发布」只是把改动提交成 PR，还需要去 GitHub 合并。合并后 Actions 会自动构建部署，1～2 分钟后生效。可以在 <https://github.com/jingpanlong/my-blog/actions> 看构建进度。

**Q：构建失败了怎么办？**
A：到 Actions 页面点开失败的工作流看日志。最常见原因是 Hugo 模板语法错误——如果刚改过 `layouts/` 下的文件，检查一下。构建失败时线上仍保持上一个版本，不会白屏。

**Q：想在合并前先看看效果？**
A：PR 创建后，GitHub Actions 会自动生成一个预览部署地址（在工作流日志里搜 `Preview URL`），只影响预览不影响线上。

**Q：登录时报 OAuth 错误？**
A：检查 GitHub OAuth App 的 **Authorization callback URL** 是否严格等于 `https://blog-oauth.470918507.workers.dev/callback`（多一个斜杠都不行）。

**Q：想改成「点发布就直接上线，不用合并 PR」？**
A：把 `static/admin/config.yml` 里的 `publish_mode: editorial_workflow` 这一行删掉即可。代价是失去草稿保护，每次保存都会直接进主线。

---

## 六、涉及的仓库文件

| 文件 | 作用 |
| --- | --- |
| `static/admin/index.html` | 后台入口页面 |
| `static/admin/config.yml` | 后台的字段与集合配置（改这里就能增减后台里的输入项） |
| `data/site.yaml` | 站点资料数据源，全站模板都读它 |
| `worker/blog-oauth.js` | GitHub OAuth 代理 Worker |
| `tools/deploy_oauth_worker.py` | OAuth Worker 部署脚本 |
| `.github/workflows/deploy.yml` | 自动构建部署工作流 |
| `content/posts/*.md` | 文章源文件 |
| `content/projects/*.md` | 项目源文件 |
| `content/about.md` | 「关于我」页面 |

---

## 七、后续可选优化

- **绑定自定义域名**：Cloudflare Pages → 自定义域，把 OAuth App 的 Homepage / 回调地址一并改掉
- **换一个专用 Cloudflare Token**：只授予 `Cloudflare Pages:Edit` 一个权限，比全权 Token 更安全
- **切到 Cloudflare 原生 Git 集成**：Cloudflare 后台 → Pages → 设置 → 连接 Git 仓库，可免去仓库里的 Token 密钥（当前账户的 Git 集成处于异常状态，报 `internal issue with your Cloudflare Pages Git installation`，需在控制台重装 GitHub 应用后才能启用）
