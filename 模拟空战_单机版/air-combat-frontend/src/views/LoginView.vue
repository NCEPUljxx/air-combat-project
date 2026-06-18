<script setup lang="ts">
import { ref } from 'vue'
import { loginApi, registerApi } from '../api/authApi'
import { authTokenState, backendUrlState, currentUserState } from '../stores/authStore'

const emit = defineEmits<{
  back: []
  loginSuccess: []
}>()

const backendUrl = ref(backendUrlState.value)
const username = ref('')
const password = ref('')
const nickname = ref('')
const error = ref('')
const loading = ref(false)

const handleRegister = async (): Promise<void> => {
  error.value = ''
  loading.value = true
  try {
    await registerApi(backendUrl.value.trim(), {
      username: username.value.trim(),
      password: password.value,
      nickname: nickname.value.trim(),
    })
  } catch (exception) {
    error.value = exception instanceof Error ? exception.message : '注册失败'
  } finally {
    loading.value = false
  }
}

const handleLogin = async (): Promise<void> => {
  error.value = ''
  loading.value = true
  try {
    const result = await loginApi(backendUrl.value.trim(), {
      username: username.value.trim(),
      password: password.value,
    })
    backendUrlState.value = backendUrl.value.trim()
    authTokenState.value = result.token
    currentUserState.value = result.user
    emit('loginSuccess')
  } catch (exception) {
    error.value = exception instanceof Error ? exception.message : '登录失败'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="home">
    <section class="panel">
      <p class="badge">联机模式 · 账号</p>
      <h1>注册与登录</h1>
      <p class="subtitle">先注册账号，再登录进入房间大厅。</p>
      <div class="difficulty-options">
        <input v-model="backendUrl" type="text" placeholder="后端地址，如 http://localhost:8080" />
        <input v-model="username" type="text" placeholder="用户名" />
        <input v-model="password" type="password" placeholder="密码" />
        <input v-model="nickname" type="text" placeholder="昵称（注册可选）" />
      </div>
      <div class="entry-buttons">
        <button type="button" class="secondary" :disabled="loading" @click="emit('back')">返回首页</button>
        <button type="button" :disabled="loading || !username || !password" @click="handleRegister">注册</button>
        <button type="button" :disabled="loading || !username || !password" @click="handleLogin">登录</button>
      </div>
      <p v-if="error" class="hud-status">{{ error }}</p>
    </section>
  </main>
</template>
