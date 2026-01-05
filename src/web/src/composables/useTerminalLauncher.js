import { ref } from 'vue'
import message, { dialog } from '../utils/message'
import { getAvailableTerminals } from '../api/terminal'
import { launchTerminal, getTerminalClipboardCommand } from '../api/sessions'

export function useTerminalLauncher() {
  const terminals = ref([])
  const detecting = ref(false)

  async function detect() {
    detecting.value = true
    terminals.value = []
    try {
      const data = await getAvailableTerminals()
      terminals.value = data.available || []
      return terminals.value
    } catch (err) {
      terminals.value = []
      message.error('检测终端失败: ' + (err.message || '未知错误'))
      return terminals.value
    } finally {
      detecting.value = false
    }
  }

  async function copy(projectName, sessionId, channel) {
    try {
      const data = await getTerminalClipboardCommand(projectName, sessionId, channel)
      const command = data?.clipboardCommand
      if (!command) {
        message.error('未获取到可复制的命令')
        return false
      }
      await navigator.clipboard.writeText(command)
      message.success('已复制到剪贴板')
      return true
    } catch (err) {
      message.error('复制失败: ' + (err.message || '未知错误'))
      return false
    }
  }

  async function launch(projectName, sessionId, channel, terminalId) {
    try {
      const data = await launchTerminal(projectName, sessionId, channel, { terminalId })
      if (data?.terminalId === 'vscode') {
        message.success('VSCode 已打开，命令已复制到剪贴板。按 Cmd+` 打开终端并粘贴执行')
        return true
      }
      message.success('已启动终端')
      return true
    } catch (err) {
      dialog.error({
        title: '启动失败',
        content: err.message || '未知错误'
      })
      return false
    }
  }

  return {
    terminals,
    detecting,
    detect,
    copy,
    launch
  }
}
