/**
 * Skills API
 */

import { client } from './client'

/**
 * 获取技能列表
 * @param {boolean} forceRefresh - 是否强制刷新缓存
 */
export async function getSkills(forceRefresh = false) {
  const response = await client.get('/skills', {
    params: { refresh: forceRefresh ? '1' : '' }
  })
  return response.data
}

/**
 * 获取已安装的技能
 */
export async function getInstalledSkills() {
  const response = await client.get('/skills/installed')
  return response.data
}

/**
 * 获取平台列表
 */
export async function getPlatforms() {
  const response = await client.get('/skills/platforms')
  return response.data
}

/**
 * 获取技能详情
 * @param {string} directory - 技能目录
 */
export async function getSkillDetail(directory) {
  const response = await client.get(`/skills/detail/${directory}`)
  return response.data
}

/**
 * 安装技能
 * @param {string} directory - 技能目录
 * @param {object} repo - 仓库信息 { owner, name, branch }
 * @param {string[]} platforms - 目标平台列表
 */
export async function installSkill(directory, repo, platforms = ['claude']) {
  const response = await client.post('/skills/install', { directory, repo, platforms })
  return response.data
}

/**
 * 卸载技能
 * @param {string} directory - 技能目录
 * @param {string[]|null} platforms - 目标平台列表，null 表示从所有已安装的平台卸载
 */
export async function uninstallSkill(directory, platforms = null) {
  const response = await client.post('/skills/uninstall', { directory, platforms })
  return response.data
}

/**
 * 创建自定义技能
 * @param {object} skill - { name, directory, description, content, platforms }
 */
export async function createCustomSkill(skill) {
  const response = await client.post('/skills/create', skill)
  return response.data
}

/**
 * 获取仓库列表
 */
export async function getSkillRepos() {
  const response = await client.get('/skills/repos')
  return response.data
}

/**
 * 添加仓库
 * @param {object} repo - { owner, name, branch, enabled }
 */
export async function addSkillRepo(repo) {
  const response = await client.post('/skills/repos', repo)
  return response.data
}

/**
 * 删除仓库
 * @param {string} owner
 * @param {string} name
 */
export async function removeSkillRepo(owner, name) {
  const response = await client.delete(`/skills/repos/${owner}/${name}`)
  return response.data
}

/**
 * 切换仓库启用状态
 * @param {string} owner
 * @param {string} name
 * @param {boolean} enabled
 */
export async function toggleSkillRepo(owner, name, enabled) {
  const response = await client.put(`/skills/repos/${owner}/${name}/toggle`, { enabled })
  return response.data
}
