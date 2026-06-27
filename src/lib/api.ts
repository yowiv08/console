export type Account = {
  unionid: string
  openid: string
  guid: string
  login_type: string
  access_token: string
  refresh_token: string
  wx_code: string
  state: string
  device_id_b64: string
  app_device_id: string
  username: string
  uin: string
  server_id_b64: string
  autoauth_key_b64: string
  autoauth_enc_key_b64: string
  created_at: string
  updated_at: string
}

export type ScanStatus =
  | 'waiting'
  | 'scanned'
  | 'authorized'
  | 'completed'
  | 'canceled'
  | 'expired'
  | 'failed'

export type ScanSession = {
  id: number
  status: ScanStatus
  guid: string
  state: string
  uuid: string
  qr_url: string
  expires_at: string
  last_errcode: string
  wx_code: string
  openid: string
  unionid: string
  account_unionid: string
  error: string
  created_at: string
  updated_at: string
}

export type ExchangeStatus = 'running' | 'succeeded' | 'failed'

export type ExchangeRun = {
  id: number
  account_unionid?: string
  appid: string
  status: ExchangeStatus
  code: string
  error: string
  started_at: string
  finished_at?: string
}

type ApiErrorBody = {
  error?: string
}

const API_BASE_URL_KEY = 'yyb-auth-console:api-base-url'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(buildApiUrl(path), {
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
    ...init,
  })

  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`
    try {
      const body = (await response.json()) as ApiErrorBody
      if (body.error) {
        message = body.error
      }
    } catch {
      // Keep the HTTP status as the error message when the body is not JSON.
    }
    throw new Error(message)
  }

  return (await response.json()) as T
}

export function getApiBaseUrl() {
  try {
    return normalizeApiBaseUrl(window.localStorage.getItem(API_BASE_URL_KEY) || '')
  } catch {
    return ''
  }
}

export function saveApiBaseUrl(raw: string) {
  const value = normalizeApiBaseUrl(raw)
  if (value) {
    window.localStorage.setItem(API_BASE_URL_KEY, value)
  } else {
    window.localStorage.removeItem(API_BASE_URL_KEY)
  }
  return value
}

export function normalizeApiBaseUrl(raw: string) {
  let value = raw.trim()
  if (!value) {
    return ''
  }

  value = value.replace(/\/+$/, '')
  if (value.startsWith('/')) {
    return value === '/' ? '' : value
  }

  if (!/^https?:\/\//i.test(value)) {
    value = `http://${value}`
  }

  const parsed = new URL(value)
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('接口地址只支持 http 或 https')
  }
  parsed.hash = ''
  parsed.search = ''
  return parsed.toString().replace(/\/+$/, '')
}

function buildApiUrl(path: string) {
  const baseURL = getApiBaseUrl()
  if (!baseURL) {
    return path
  }
  if (baseURL.endsWith('/api') && path.startsWith('/api/')) {
    return `${baseURL}${path.slice('/api'.length)}`
  }
  return `${baseURL}${path}`
}

export const api = {
  accounts: () => request<Account[]>('/api/accounts'),
  account: (unionid: string) =>
    request<Account>(`/api/accounts/${encodeURIComponent(unionid)}`),
  createScan: () => request<ScanSession>('/api/scans', { method: 'POST' }),
  getScan: (id: number) => request<ScanSession>(`/api/scans/${id}`),
  pollScan: (id: number) =>
    request<ScanSession>(`/api/scans/${id}/poll`, { method: 'POST' }),
  exchangeCode: (unionid: string, appid: string) =>
    request<ExchangeRun>(`/api/accounts/${encodeURIComponent(unionid)}/code`, {
      method: 'POST',
      body: JSON.stringify({ appid }),
    }),
  run: (id: number) => request<ExchangeRun>(`/api/runs/${id}`),
}

export function isTerminalScan(status: ScanStatus) {
  return ['completed', 'canceled', 'expired', 'failed'].includes(status)
}
