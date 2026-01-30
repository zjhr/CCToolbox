<div align="center">

<img src="docs/logo.png" alt="CCToolbox Logo" width="140" />

# CCToolbox

**Claude Code / Codex / Gemini CLI 增强工具**

智能会话管理 | 多渠道动态切换 | 实时 Token 监控

[![npm version](https://img.shields.io/npm/v/cctoolbox.svg?style=flat-square)](https://www.npmjs.com/package/cctoolbox)
[![npm downloads](https://img.shields.io/npm/dm/cctoolbox.svg?style=flat-square)](https://www.npmjs.com/package/cctoolbox)
[![GitHub stars](https://img.shields.io/github/stars/zjhr/coding-tool?style=flat-square)](https://github.com/zjhr/coding-tool/stargazers)
[![License](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D14.0.0-brightgreen.svg?style=flat-square)](package.json)

<br />

<img src="docs/home.png" alt="CCToolbox Preview" width="90%" />

<p><sub>现代化 Web 界面 - 项目管理、会话浏览、实时日志监控</sub></p>

</div>

---

## ✨ 特性

| 功能                  | 描述                                                                      |
| --------------------- | ------------------------------------------------------------------------- |
| **智能会话管理**      | 自动识别 Claude/Codex/Gemini 历史会话，支持命名、搜索、Fork 分支、标签分类 |
| **对话详情增强**      | 工具调用可视化渲染、消息类型过滤、后端颜色区分、智能折叠和虚拟滚动优化、Subagent 详情查看    |
| **会话回收站**        | 7天误删保护，支持批量删除、恢复和永久清理                                  |
| **多渠道负载均衡**    | 同时启用多个渠道，按权重自动分配请求，支持并发控制和健康检查                |
| **动态渠道切换**      | 管理多个 API 渠道，一键切换无需重启，成本优化与稳定性兼得                   |
| **渠道搜索过滤**      | 实时搜索渠道列表，支持按名称、API地址、模型字段模糊匹配和高亮显示          |
| **实时 Token 监控**   | 可视化展示每次请求的 Token 消耗（输入/输出/缓存命中）                       |
| **全局搜索**          | `⌘/Ctrl + K` 跨项目搜索会话内容，支持 `tag:关键词` 标签搜索和模糊匹配     |
| **VSCode 终端集成**   | macOS 支持 VSCode 作为终端选项，自动打开项目并复制命令到剪贴板            |
| **统一终端启动器**    | 【使用对话】下拉菜单支持复制命令和多终端启动选择，无需在设置中预选终端    |
| **AI 助手功能**       | 支持 Ollama/OpenAI/Gemini，自动生成会话别名和标签，智能对话总结            |
| **Serena UI**         | Serena MCP 可视化管理，项目记忆管理、语义浏览器、代码符号查看              |
| **现代化 Web UI**     | 响应式设计，支持亮色/暗色主题，三列拖拽排序                                 |
| **桌面端安装**        | 浏览器支持一键安装为桌面应用（PWA）                                         |
| **OpenSpec 规范管理** | 在 SessionList 中打开 OpenSpec 抽屉，集中查看/编辑规范与变更，支持临时规范混合排序显示 |
| **Skill 管理** | 全局 Skill 管理 Drawer，支持缓存、禁用/启用技能，Claude/Codex/Gemini 三平台统一显示技能数量 |
| **技能上传与更新** | 支持 ZIP/文件夹上传技能，GitHub 版本自动检测，24 小时缓存重新安装，按技能项配置更新源 |

---

## 📦 安装

### 从源码构建

```bash
git clone https://github.com/zjhr/coding-tool.git
cd coding-tool
./install.sh
```

### 验证安装

```bash
ct --version
```

---

## 🚀 快速开始

### 启动 Web UI（推荐）

```bash
ct ui
```

浏览器自动打开 `http://localhost:9999`，即可开始管理会话和渠道。
支持 PWA 的浏览器可点击右上角“安装为桌面应用”按钮，将 Web UI 固定为桌面端。

### 命令行交互模式

```bash
ct
```

启动交互式菜单，通过键盘完成会话管理和渠道切换。

---

## 📋 命令参考

### 核心命令

| 命令           | 描述                 |
| -------------- | -------------------- |
| `ct`           | 启动交互式命令行界面 |
| `ct ui`        | 启动 Web UI 管理界面 |
| `ct update`    | 检查并更新到最新版本 |
| `ct --version` | 显示版本号           |
| `ct --help`    | 显示帮助信息         |

### 更新方式

- **Git 部署（git clone）**：Web UI 顶栏显示更新徽章，可一键更新并重启服务；终端也可运行 `ct update`。
- **npm 安装**：继续使用 `ct update` 检查并更新到最新版本。
- **更新脚本**：Git 更新由项目根目录 `update.py` 执行（包含拉取、构建、重启、健康检查）。

### 代理管理

| 命令              | 描述                         |
| ----------------- | ---------------------------- |
| `ct proxy start`  | 启动代理服务（动态切换渠道） |
| `ct proxy stop`   | 停止代理服务                 |
| `ct proxy status` | 查看代理运行状态             |

### 后台运行（基于 PM2）

| 命令                | 描述                       |
| ------------------- | -------------------------- |
| `ct daemon start`   | 后台启动服务（可关闭终端） |
| `ct daemon stop`    | 停止后台服务               |
| `ct daemon restart` | 重启后台服务               |
| `ct daemon status`  | 查看后台服务状态           |
| `ct daemon logs`    | 查看 PM2 运行日志          |

### 日志管理

| 命令                  | 描述                 |
| --------------------- | -------------------- |
| `ct logs`             | 查看所有日志         |
| `ct logs ui`          | 查看 Web UI 日志     |
| `ct logs claude`      | 查看 Claude 代理日志 |
| `ct logs codex`       | 查看 Codex 代理日志  |
| `ct logs gemini`      | 查看 Gemini 代理日志 |
| `ct logs --follow`    | 实时跟踪日志输出     |
| `ct logs --lines 100` | 显示最后 100 行日志  |
| `ct logs --clear`     | 清空所有日志文件     |

### 系统工具

| 命令        | 描述                             |
| ----------- | -------------------------------- |
| `ct doctor` | 运行系统诊断，检查配置和环境     |
| `ct stats`  | 查看使用统计（会话数、Token 等） |
| `ct reset`  | 重置配置文件                     |

---

## 📖 核心功能

### 会话管理

- **多平台支持**：统一管理 Claude Code、Codex CLI、Gemini CLI 的会话
- **会话别名**：为会话设置易记的名称，方便识别
- **Fork 会话**：基于现有对话创建分支，探索不同方向
- **快速启动**：一键在终端中恢复历史会话

### 多渠道管理

- **多渠道负载均衡**：同时启用多个渠道，系统自动按权重分配请求
- **权重配置**：为每个渠道设置权重（1-100），高权重渠道获得更多流量
- **并发控制**：为每个渠道设置最大并发数，精细控制负载
- **健康检查**：自动检测渠道状态，问题渠道自动冻结和恢复
- **会话绑定**：可选开启，确保同一会话的请求发送到同一渠道
- **可视化配置**：添加、编辑、删除渠道，拖拽调整优先级
- **安全存储**：API Key 脱敏显示，配置本地加密存储

### 后台运行模式

- **PM2 集成**：基于 PM2 进程管理，稳定可靠
- **持久化运行**：启动后可关闭终端，服务持续运行
- **开机自启**：支持系统启动时自动启动服务
- **日志管理**：统一日志存储，支持实时查看和清理
- **状态监控**：随时查看后台服务运行状态

### 系统诊断与监控

- **健康检查**：`ct doctor` 一键诊断系统健康状态
  - Node.js 版本兼容性检查
  - 配置文件完整性验证
  - 端口占用情况检测
  - 磁盘空间监控
- **日志管理**：`ct logs` 查看和管理各类日志
  - 支持按类型筛选（UI/Claude/Codex/Gemini）
  - 实时跟踪模式（--follow）
  - 灵活的行数控制
- **使用统计**：`ct stats` 查看详细统计信息
  - 会话数量和分布
  - Token 使用情况
  - API 调用统计

### 实时监控

- **WebSocket 推送**：实时查看 API 请求详情
- **Token 统计**：输入/输出/缓存写入/缓存命中分类统计
- **成本估算**：基于自定义价格计算 API 调用成本

### OpenSpec 规范管理

- **一键入口**：在 SessionList 页面点击 OpenSpec 按钮打开规范抽屉
- **集中浏览**：项目/规范/变更/档案/设置统一视图
- **内联编辑**：Markdown 直改直存，支持冲突提示与手动合并
- **自动同步**：WebSocket 实时推送 + 15 秒定时刷新
- **使用指南**：参见 `docs/openspec-ui.md`

---

## 🎨 使用技巧

<details>
<summary><b>多渠道负载均衡配置</b></summary>

1. 在 Web UI 的渠道管理中添加多个渠道
2. 点击渠道卡片上的「启用」按钮，启用需要参与负载均衡的渠道
3. 设置每个渠道的**权重**（1-100），权重越高获得的请求越多
4. 设置每个渠道的**最大并发数**，控制同时处理的请求数量
5. 启动代理后，系统自动按权重分配请求到各个启用的渠道

> **提示**：渠道出现问题时会自动冻结，恢复后自动解冻，无需人工干预

</details>

<details>
<summary><b>后台运行服务</b></summary>

1. 使用 `ct daemon start` 启动后台服务
2. 服务启动后，可以安全关闭终端窗口
3. 使用 `ct daemon status` 随时查看运行状态
4. 使用 `ct daemon logs` 查看实时日志

> **优势**：无需保持终端窗口打开，服务持久运行

</details>

<details>
<summary><b>VSCode 终端集成（macOS）</b></summary>

1. 在 Web UI 的「设置 > 终端工具」选择 VSCode。
2. 在会话列表点击「使用对话」。
3. VSCode 会打开到项目目录，命令已复制到剪贴板。
4. 按 `Cmd+`` 打开 VSCode 终端并粘贴执行。

**常见问题**

- **VSCode 未检测到**：确认应用位于 `/Applications/Visual Studio Code.app`，或已安装预览版；也可在 VSCode 中执行 `Shell Command: Install 'code' command in PATH`。
- **剪贴板不工作**：检查系统剪贴板是否被第三方工具占用，必要时手动执行命令（格式：`claude -r <sessionId>`）。
- **权限问题**：如果系统弹出权限提示，请允许相关应用访问自动化/剪贴板权限。

</details>

<details>
<summary><b>系统诊断</b></summary>

遇到问题时，首先运行 `ct doctor` 进行全面诊断：

```bash
ct doctor
```

诊断工具会自动检查：

- Node.js 版本是否兼容
- 配置文件是否正常
- 端口是否被占用
- 磁盘空间是否充足

并提供针对性的修复建议。

</details>

<details>
<summary><b>日志管理</b></summary>

查看实时日志，排查问题：

```bash
# 实时跟踪所有日志
ct logs --follow

# 查看 Claude 代理日志的最后 100 行
ct logs claude --lines 100

# 清空所有日志文件
ct logs --clear
```

</details>

<details>
<summary><b>全局搜索</b></summary>

1. 在任意页面按 `⌘/Ctrl + K`
2. 输入关键词搜索所有项目的会话内容
3. 点击搜索结果直接启动对话

</details>

<details>
<summary><b>渠道管理</b></summary>

1. 在渠道列表中点击「启用/禁用」按钮切换渠道状态
2. 启用的渠道会自动参与负载均衡
3. 可以随时调整权重和并发数，实时生效
4. 渠道健康状态异常时可点击「重置」恢复

> **注意**：使用 `ct daemon start` 后台运行时，渠道变更会实时生效

</details>

<details>
<summary><b>Fork 会话</b></summary>

1. 在会话列表中点击 Fork 按钮
2. 新会话继承原会话的所有历史消息
3. 可以基于相同上下文探索不同方向

</details>

---

## ❓ 常见问题

<details>
<summary>Web UI 显示 Cannot GET / ？</summary>

这是因为前端未构建。从源码安装时需要构建前端：

```bash
cd src/web && npm install && npm run build
```

构建完成后，`dist/web` 目录会被创建，服务器就能正常提供静态文件了。

</details>

<details>
<summary>如何后台运行服务？</summary>

使用 `ct daemon start` 启动后台服务，基于 PM2 进程管理，启动后可以安全关闭终端窗口。

查看状态：`ct daemon status`
查看日志：`ct daemon logs`
停止服务：`ct daemon stop`

</details>

<details>
<summary>后台服务如何开机自启？</summary>

在 Web UI 的设置中，开启"开机自启"选项，或使用 API：

```bash
ct daemon start
# 然后在 Web UI 设置中启用开机自启
```

</details>

<details>
<summary>如何查看运行日志？</summary>

使用 `ct logs` 命令：

```bash
ct logs              # 查看所有日志
ct logs claude       # 查看 Claude 代理日志
ct logs --follow     # 实时跟踪日志
ct logs --clear      # 清空日志
```

日志文件存储在 `~/.claude/logs/` 目录。

</details>

<details>
<summary>遇到问题如何诊断？</summary>

运行 `ct doctor` 进行系统诊断，会自动检查：

- Node.js 版本
- 配置文件
- 端口占用
- 磁盘空间
- 进程状态

并提供针对性的修复建议。

</details>

<details>
<summary>如何配置多渠道负载均衡？</summary>

1. 添加多个渠道到系统
2. 启用需要参与负载均衡的渠道
3. 为每个渠道设置权重和最大并发数
4. 启动代理，系统自动按权重分配请求

渠道出现问题时会自动冻结，恢复后自动解冻。

</details>

<details>
<summary>动态切换不生效？</summary>

1.6.0 版本后，不再需要手动切换"默认渠道"。系统会自动在所有启用的渠道间进行负载均衡。

确保至少有一个渠道处于启用状态，代理启动后会自动使用。

</details>

<details>
<summary>实时日志不显示？</summary>

实时日志需要先开启「动态切换」功能，代理服务运行后才能捕获请求。

推荐使用 `ct daemon start` 后台运行，然后通过 `ct logs --follow` 查看实时日志。

</details>

<details>
<summary>如何备份配置？</summary>

直接复制以下目录即可备份所有配置和数据：

- 配置：`~/.claude/cctoolbox/`
- 日志：`~/.claude/logs/`

</details>

---

## 📝 更新日志

查看完整更新日志：**[CHANGELOG.md](CHANGELOG.md)**

---

## 🤝 贡献

欢迎提交 [Issue](https://github.com/zjhr/coding-tool/issues) 和 [Pull Request](https://github.com/zjhr/coding-tool/pulls)！

---

## 📄 许可证

[MIT License](LICENSE) © 2025 CooperJiang

---

<div align="center">

**如果这个项目对你有帮助，请给它一个 Star ⭐**

[![Star History Chart](https://api.star-history.com/svg?repos=zjhr/coding-tool&type=Date)](https://star-history.com/#zjhr/coding-tool&Date)

</div>
