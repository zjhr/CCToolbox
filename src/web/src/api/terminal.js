import { client } from './client'

export async function getAvailableTerminals() {
  const response = await client.get('/settings/terminals')
  return response.data
}
