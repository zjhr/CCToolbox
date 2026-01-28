# 技能管理更新说明

本文档描述技能管理更新功能的 API 与用户操作指引。

## API 文档

### POST /api/skills/upload

**用途**：上传 ZIP 或文件夹并安装技能。  
**Content-Type**：`multipart/form-data`

**请求参数**
- `files`：ZIP 文件或文件夹文件列表（必填）
- `force`：是否强制覆盖同版本（可选，`true`/`false`）

**返回示例**
```json
{
  "success": true,
  "directory": "my-skill",
  "installedPlatforms": ["claude"],
  "metadata": {
    "name": "My Skill",
    "description": "示例技能",
    "version": "1.0.0"
  }
}
```

**错误码**
- `FILE_TOO_LARGE`：文件大小超过 50MB
- `INVALID_ZIP`：ZIP 文件不合法或内容异常
- `NO_SKILL_MD`：未找到 SKILL.md
- `VERSION_SAME`：版本相同（需用户确认强制覆盖）

### POST /api/skills/update-source

**用途**：为指定技能设置更新源（GitHub 仓库地址）。  
**请求体**
```json
{ "directory": "demo-skill", "repo": "owner/repo#branch" }
```

**返回示例**
```json
{
  "success": true,
  "data": {
    "directory": "demo-skill",
    "repoOwner": "owner",
    "repoName": "repo",
    "repoBranch": "main",
    "lastCheckedAt": "2025-01-01T10:00:00.000Z",
    "hasUpdate": false,
    "latestVersion": "0.2.0"
  }
}
```

**错误码**
- `INVALID_REPO_URL`：仓库地址格式错误

### POST /api/skills/update

**用途**：按更新源手动更新技能。  
**请求体**
```json
{ "directory": "demo-skill" }
```

**错误码**
- `UPDATE_SOURCE_NOT_FOUND`：未配置更新源
- `SKILL_NOT_INSTALLED`：技能未安装，无法更新

### POST /api/skills/reinstall

**用途**：卸载后 24 小时内从缓存重新安装技能。  
**请求体**
```json
{ "directory": "demo-skill" }
```

**错误码**
- `CACHE_NOT_FOUND`：缓存不存在
- `REINSTALL_EXPIRED`：重新安装已过期

### DELETE /api/skills/cached/:directory

**用途**：删除缓存（禁用/卸载后）。  
**参数**：`directory` 为技能目录名

---

## 用户文档

### 新增技能（上传）
1. 在技能管理页点击【新增技能】。
2. 选择 ZIP 或文件夹进行上传。
3. 上传成功后弹出平台选择，默认全选。
4. 若版本相同，会提示是否强制覆盖。

### 更新与更新源
1. 在技能列表项点击【设置更新】，填写 GitHub 地址（可选分支）。
2. 服务启动时会自动检查已配置更新源的技能。
3. 若检测到更新，列表项会显示【有更新】并提供【更新】按钮。

### 重新安装
1. 卸载技能后 24 小时内会显示【重新安装】按钮。
2. 倒计时显示剩余时间（>1 小时绿色，≤1 小时橙色）。
3. 过期后仅显示【删除缓存】按钮。

### 本地覆盖
1. 上传与已安装技能同名的 ZIP/文件夹。
2. 版本相同会提示是否强制覆盖。
3. 版本不同会直接覆盖并刷新列表。
