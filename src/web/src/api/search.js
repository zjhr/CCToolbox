import { client } from './client'

export async function searchSessionsAcrossProjects(keyword, contextLength = 35) {
  const response = await client.get('/search/sessions', {
    params: { keyword, context: contextLength }
  })
  return response.data
}
