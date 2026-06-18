export interface UserProfile {
  id: number
  username: string
  nickname: string
}

export interface AuthResult {
  token: string
  user: UserProfile
}

const toErrorMessage = async (response: Response): Promise<string> => {
  try {
    const payload = (await response.json()) as { message?: string }
    if (payload.message) {
      return payload.message
    }
  } catch {
    // ignore
  }
  return `请求失败(${response.status})`
}

export const registerApi = async (
  baseUrl: string,
  payload: { username: string; password: string; nickname: string },
): Promise<UserProfile> => {
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    throw new Error(await toErrorMessage(response))
  }
  const data = (await response.json()) as { user: UserProfile }
  return data.user
}

export const loginApi = async (
  baseUrl: string,
  payload: { username: string; password: string },
): Promise<AuthResult> => {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    throw new Error(await toErrorMessage(response))
  }
  return (await response.json()) as AuthResult
}

const tokenHeaders = (token: string): HeadersInit => ({
  'Content-Type': 'application/json',
  'X-Token': token,
})

export const logoutApi = async (baseUrl: string, token: string): Promise<void> => {
  const response = await fetch(`${normalizeRoot(baseUrl)}/api/auth/logout`, {
    method: 'POST',
    headers: tokenHeaders(token),
  })
  if (!response.ok && response.status !== 401) {
    throw new Error(await toErrorMessage(response))
  }
}

/** 页面关闭时用 sendBeacon 尽力注销（无法用自定义 Header） */
export const sendLogoutBeacon = (baseUrl: string, token: string): void => {
  if (!token.trim()) {
    return
  }
  const url = `${normalizeRoot(baseUrl)}/api/auth/logout-beacon`
  try {
    const blob = new Blob([new URLSearchParams({ token }).toString()], {
      type: 'application/x-www-form-urlencoded',
    })
    navigator.sendBeacon(url, blob)
  } catch {
    // ignore
  }
}

function normalizeRoot(baseUrl: string): string {
  let root = baseUrl.trim()
  while (root.endsWith('/')) {
    root = root.slice(0, -1)
  }
  const lower = root.toLowerCase()
  if (lower.endsWith('/api')) {
    root = root.slice(0, -4)
    while (root.endsWith('/')) {
      root = root.slice(0, -1)
    }
  }
  return root
}
