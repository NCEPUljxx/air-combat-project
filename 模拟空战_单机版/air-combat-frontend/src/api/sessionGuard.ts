import { clearAuthState } from '../stores/authStore'

type InvalidHandler = (() => void) | null

let onSessionInvalidated: InvalidHandler = null

export const setAuthInvalidRedirect = (handler: () => void): void => {
  onSessionInvalidated = handler
}

/** REST 401 时清理本地会话并交由 App 切换到登录等业务态 */
export const invalidateSessionFromApi = (): void => {
  clearAuthState()
  onSessionInvalidated?.()
}
