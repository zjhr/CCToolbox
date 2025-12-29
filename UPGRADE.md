# 升级到 CCToolbox

本指南适用于从旧版本（coding-tool）升级到新版 CCToolbox 的用户。

## 自动迁移（推荐）

首次启动时将自动迁移配置：

- 旧路径：`~/.claude/cc-tool/`
- 新路径：`~/.claude/cctoolbox/`
- 迁移方式：复制（保留旧目录作为备份）

迁移完成后会生成标记文件：

- `~/.claude/cctoolbox/.migration-complete`

如遇错误，会记录日志：

- `~/.claude/cctoolbox-migration-error.log`

## 手动迁移（可选）

若自动迁移失败，可手动复制旧目录内容到新目录：

```bash
mkdir -p ~/.claude/cctoolbox
cp -R ~/.claude/cc-tool/* ~/.claude/cctoolbox/
```

## npm 包名变更

新包名为 `cctoolbox`：

```bash
npm install -g cctoolbox
```

旧包 `coding-tool` 将逐步弃用，建议升级到新包名。

## Web UI 本地存储迁移

Web UI 会自动将 localStorage 键名从 `cc-tool-*` 迁移到 `cctoolbox-*`，
旧键名将在 7 天后自动清理。
