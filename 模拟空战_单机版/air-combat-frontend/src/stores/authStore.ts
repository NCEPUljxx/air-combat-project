import { ref } from 'vue'
import type { UserProfile } from '../api/authApi'

export const backendUrlState = ref('http://localhost:8080')
export const authTokenState = ref('')
export const currentUserState = ref<UserProfile | null>(null)

export const clearAuthState = (): void => {
  authTokenState.value = ''
  currentUserState.value = null
}
