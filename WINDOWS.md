# Windows 兼容性说明

> **CCToolbox 全面支持 Windows 平台** - 从 v3.5.2 版本起，已针对 Windows 进行深度优化

## 📋 目录

- [快速开始](#快速开始)
- [系统要求](#系统要求)
- [安装方式](#安装方式)
- [启动方式](#启动方式)
- [常见问题](#常见问题)
- [权限说明](#权限说明)
- [终端支持](#终端支持)
- [环境变量管理](#环境变量管理)
- [开机自启](#开机自启)

---

## 快速开始

### 方式一：PowerShell 脚本（推荐）

```powershell
# 1. 克隆仓库
git clone https://github.com/zjhr/coding-tool.git
cd coding-tool

# 2. 安装依赖
.\run.ps1 -Task install

# 3. 启动 Web UI
.\run.ps1 -Task start

# 4. 查看状态
.\run.ps1 -Task status
```

### 方式二：npm 全局安装

```powershell
npm install -g cctoolbox
ct ui
```

---

## 系统要求

### Node.js 版本

- **最低版本**：Node.js 14.0.0 或更高
- **推荐版本**：Node.js 18.x 或 20.x LTS

### 检查 Node.js 版本

```powershell
node --version
npm --version
```

### 包管理器支持

CCToolbox 的 Windows 启动脚本 (`run.ps1`) 会自动检测以下包管理器：

1. **标准 npm** - 通过 `npm` 命令直接调用
2. **Volta** - 自动检测 `%LOCALAPPDATA%\Volta\tools\image\node\` 路径
3. **Node + npm-cli 回退** - 当 npm 命令异常时，自动回退到 `node node_modules\npm\bin\npm-cli.js`

> **提示**：如果你的 Node.js 通过 Volta 安装，脚本会自动找到正确的可执行文件。

---

## 安装方式

### 从源码安装

```powershell
# 克隆仓库
git clone https://github.com/zjhr/coding-tool.git
cd coding-tool

# 安装依赖
.\run.ps1 -Task install

# 运行测试（可选）
.\run.ps1 -Task test
```

### npm 全局安装

```powershell
npm install -g cctoolbox
ct --version
```

---

## 启动方式

### 1. Web UI 启动（推荐）

#### 使用 PowerShell 脚本

```powershell
.\run.ps1 -Task start
```

**脚本会自动完成：**
- ✅ 检测 `dist/web` 目录是否存在，不存在则自动构建前端
- ✅ 启动 Web UI 服务
- ✅ 执行健康检查（端口 10099 或配置的其他端口）
- ✅ 失败时显示错误日志和修复建议

#### 使用 npm 命令

```powershell
ct ui
```

浏览器会自动打开 `http://localhost:10099`（或配置的其他端口）。

### 2. 命令行交互模式

```powershell
ct
```

或使用 PowerShell 脚本：

```powershell
.\run.ps1 -Task menu
```

### 3. 后台运行（PM2）

```powershell
ct daemon start
ct daemon status
ct daemon logs
ct daemon stop
```

---

## 常见问题

### ❌ 端口绑定失败（EACCES 错误）

**症状：**
```
❌ 无法监听端口 10099（权限不足）
```

**原因：**
Windows 可能限制非管理员用户绑定某些端口（尤其是低于 1024 的端口，或被系统保留的端口）。

**解决方案：**

1. **方式一：以管理员身份运行**
   - 右键点击 PowerShell → "以管理员身份运行"
   - 重新执行 `.\run.ps1 -Task start`

2. **方式二：更换端口**
   - 运行 `ct ui` 启动服务
   - 打开 Web UI → 设置 → 端口配置
   - 修改为其他可用端口（如 18099）

3. **方式三：检查端口占用**
   ```powershell
   netstat -ano | findstr :10099
   ```

### ❌ Web UI 显示 "Cannot GET /"

**原因：**
前端资源未构建。

**解决方案：**

```powershell
# 方式一：使用脚本自动构建
.\run.ps1 -Task start  # 会自动检测并构建

# 方式二：手动构建
.\run.ps1 -Task web-build
```

### ❌ UTF-8 BOM 导致配置解析失败

**症状：**
```
SyntaxError: Unexpected token ﻿ in JSON at position 0
```

**原因：**
Windows 记事本保存的 UTF-8 文件带有 BOM 标记。

**解决方案：**
CCToolbox 已自动处理 BOM 问题（v3.5.2+）。如果你遇到此问题，请更新到最新版本：

```powershell
ct update
```

### ❌ 环境变量未生效

**原因：**
Windows 环境变量需要通过 `setx` 命令持久化，或修改注册表。

**解决方案：**

1. **CCToolbox 自动同步（推荐）**
   - 在 Web UI 的渠道配置中填写 API Key
   - 系统会自动使用 `setx` 同步到用户环境变量
   - **注意**：daemon 模式下会禁用自动同步，避免频繁调用 `setx`

2. **手动设置环境变量**
   ```powershell
   setx ANTHROPIC_API_KEY "your-api-key-here"
   ```

3. **PowerShell Profile 设置**
   编辑 PowerShell Profile 文件：
   ```powershell
   notepad $PROFILE
   ```
   添加：
   ```powershell
   $env:ANTHROPIC_API_KEY = "your-api-key-here"
   ```

### ❌ PM2 开机自启不工作

**原因：**
PM2 的 `startup` 命令不支持 Windows 平台。

**解决方案：手动配置任务计划程序**

1. **保存当前 PM2 进程列表**
   ```powershell
   pm2 save
   ```

2. **创建任务计划**
   - 打开"任务计划程序"（Task Scheduler）
   - 创建基本任务 → 名称："CCToolbox PM2 Resurrect"
   - 触发器："当我登录时"
   - 操作："启动程序"
   - 程序或脚本：`pm2`
   - 参数：`resurrect`

3. **确保路径一致**
   如果使用 Volta 或 nvm 管理 Node.js，确保任务计划使用的路径与当前环境一致。

---

## 权限说明

### 何时需要管理员权限？

| 操作 | 是否需要管理员权限 |
|------|------------------|
| 安装全局 npm 包 | ❌ 不需要（如果使用用户级安装） |
| 绑定受保护的端口（<1024） | ✅ 需要 |
| 修改系统环境变量 | ✅ 需要 |
| 修改用户环境变量 | ❌ 不需要（`setx` 即可） |
| 启动 Web UI（普通端口） | ❌ 不需要 |

### 以管理员身份运行 PowerShell

1. 搜索 "PowerShell"
2. 右键点击 → "以管理员身份运行"
3. 导航到项目目录：
   ```powershell
   cd C:\path\to\coding-tool
   ```

---

## 终端支持

CCToolbox 支持在多种 Windows 终端中启动会话：

### 支持的终端

| 终端 | 终端 ID | 说明 |
|------|---------|------|
| **CMD** | `cmd` | Windows 默认命令提示符 |
| **PowerShell** | `powershell` | Windows PowerShell 或 PowerShell Core |
| **Windows Terminal** | `windows-terminal` | 现代化终端应用（推荐） |
| **Git Bash** | `git-bash` | Git for Windows 自带的 Bash |

### 使用方式

1. 打开 Web UI
2. 进入"设置" → "终端工具"
3. 选择你喜欢的终端
4. 在会话列表中点击"使用对话"

### 终端启动命令示例

**CMD:**
```cmd
start "Claude Session" cmd /k "cd /d "C:\your\project" && claude -r session-id"
```

**PowerShell:**
```powershell
start powershell -NoExit -Command "Set-Location -LiteralPath 'C:\your\project'; claude -r session-id"
```

**Windows Terminal:**
```powershell
wt.exe -d "C:\your\project" cmd /k "claude -r session-id"
```

**Git Bash:**
```bash
start "" "C:\Program Files\Git\bin\bash.exe" -c "cd '/c/your/project' && claude -r session-id; exec bash"
```

> **注意**：每种终端都有特定的路径转义和命令格式，CCToolbox 会自动处理这些差异。

---

## 环境变量管理

### 自动同步机制

CCToolbox 会在以下场景自动同步环境变量到 Windows 用户环境变量：

1. **添加/编辑渠道时** - API Key 自动同步
2. **切换渠道时** - 对应的环境变量自动更新

**同步方式：**
- 使用 `setx` 命令写入注册表 `HKCU\Environment`
- 先查询再设置，避免不必要的重复写入
- **daemon 模式下禁用自动同步**，防止频繁调用 `setx`

### PowerShell Profile 冲突检测

CCToolbox 会检测以下文件中的环境变量冲突：

- `$HOME\Documents\PowerShell\Microsoft.PowerShell_profile.ps1`
- `$HOME\Documents\WindowsPowerShell\Microsoft.PowerShell_profile.ps1`
- `$HOME\Documents\PowerShell\profile.ps1`

**检测逻辑：**
解析 `$env:ANTHROPIC_API_KEY = "value"` 格式的配置。

### 手动管理环境变量

**查看环境变量：**
```powershell
# 命令行查看
echo $env:ANTHROPIC_API_KEY

# 注册表查看
reg query "HKCU\Environment" /V ANTHROPIC_API_KEY
```

**设置环境变量：**
```powershell
# 用户环境变量（推荐）
setx ANTHROPIC_API_KEY "sk-ant-..."

# 系统环境变量（需要管理员权限）
setx ANTHROPIC_API_KEY "sk-ant-..." /M
```

**删除环境变量：**
```powershell
reg delete "HKCU\Environment" /V ANTHROPIC_API_KEY
```

---

## 开机自启

### Windows 平台限制

❌ PM2 的 `pm2 startup` 命令不支持 Windows。

✅ 需要手动配置任务计划程序。

### 手动配置步骤

#### 1. 保存 PM2 进程列表

```powershell
ct daemon start
pm2 save
```

这会在 `~/.pm2/dump.pm2` 中保存当前进程列表。

#### 2. 创建任务计划

**方式一：使用任务计划程序 GUI**

1. 搜索并打开"任务计划程序"（Task Scheduler）
2. 右侧点击"创建基本任务"
3. 名称：`CCToolbox PM2 Resurrect`
4. 触发器：选择"当我登录时"
5. 操作：选择"启动程序"
6. 程序或脚本：填写 `pm2` 的完整路径
   - 查找路径：`where.exe pm2`
   - 示例：`C:\Users\YourName\AppData\Roaming\npm\pm2.cmd`
7. 参数：`resurrect`
8. 起始于（可选）：`C:\Users\YourName`

**方式二：使用 PowerShell 创建任务**

```powershell
# 查找 pm2 路径
$pm2Path = (Get-Command pm2).Source

# 创建任务
$action = New-ScheduledTaskAction -Execute $pm2Path -Argument "resurrect"
$trigger = New-ScheduledTaskTrigger -AtLogon
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBattery -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName "CCToolbox PM2 Resurrect" -Action $action -Trigger $trigger -Settings $settings
```

#### 3. 验证任务

1. 注销并重新登录
2. 检查服务是否自动启动：
   ```powershell
   ct daemon status
   ```

### 注意事项

- **路径一致性**：如果使用 Volta 或 nvm 管理 Node.js，确保任务计划使用的路径与当前环境一致
- **执行策略**：PowerShell 可能需要调整执行策略：
  ```powershell
  Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
  ```

---

## PowerShell 脚本详细说明

### run.ps1 可用任务

```powershell
.\run.ps1 -Task install      # 安装依赖
.\run.ps1 -Task test         # 运行测试
.\run.ps1 -Task start        # 启动 Web UI 服务（后台）
.\run.ps1 -Task status       # 查看服务状态
.\run.ps1 -Task stop         # 停止服务
.\run.ps1 -Task menu         # 打开交互式菜单
.\run.ps1 -Task dev-server   # 启动开发服务器
.\run.ps1 -Task web-install  # 安装前端依赖
.\run.ps1 -Task web-dev      # 启动前端开发模式
.\run.ps1 -Task web-build    # 构建前端资源
.\run.ps1 -Task all          # install + test
.\run.ps1 -Task help         # 显示帮助
```

### 健康检查机制

`run.ps1 -Task start` 会执行以下健康检查：

1. **检测 Web UI 端口** - 读取配置文件中的 `ports.webUI` 字段（默认 10099）
2. **发送健康检查请求** - `GET http://127.0.0.1:PORT/health`
3. **失败时显示错误日志** - 自动显示最后 12 行错误日志
4. **提供修复建议** - 针对常见错误（EACCES/EADDRINUSE）给出具体解决方案

### 智能构建检测

脚本启动时会自动检查 `dist/web/index.html` 是否存在：
- ✅ **存在** → 直接启动服务
- ❌ **不存在** → 自动执行 `npm install`（如果 `src/web/node_modules` 不存在）+ `npm run build:web`

---

## 更多帮助

如果遇到其他问题：

1. **运行诊断工具**
   ```powershell
   ct doctor
   ```

2. **查看日志**
   ```powershell
   ct logs --follow
   ```

3. **提交 Issue**
   - GitHub: https://github.com/zjhr/coding-tool/issues
   - 请附上诊断结果和错误日志

---

**最后更新：2026-04-13**
