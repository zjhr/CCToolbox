import { client } from './client'

export async function checkUpdate() {
  const response = await client.get('/update/check')
  return response.data
}

export async function executeUpdate() {
  const response = await client.post('/update/execute')
  return response.data
}
