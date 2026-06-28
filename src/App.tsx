import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type Dispatch,
  type FormEvent,
  type ReactNode,
  type SetStateAction,
} from 'react'
import {
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  Clock3,
  Code2,
  Copy,
  Eye,
  EyeOff,
  Home,
  ListChecks,
  Loader2,
  Play,
  QrCode,
  RefreshCcw,
  ScanLine,
  Server,
  Settings,
  ShieldCheck,
  UsersRound,
  X,
} from 'lucide-react'
import './App.css'
import {
  type Account,
  type CodeType,
  type ExchangeRun,
  type ExchangeStatus,
  type ScanSession,
  type ScanStatus,
  api,
  getApiBaseUrl,
  isTerminalScan,
  saveApiBaseUrl,
} from './lib/api'

const RECENT_RUNS_KEY = 'yyb-auth-console:recent-runs'
const CODE_RUN_TIMEOUT_MS = 75_000

const ApiBaseUrlContext = createContext('')

type NavItem = {
  path: string
  label: string
  icon: typeof Home
}

type CodeFlowStatus = 'idle' | 'running' | 'succeeded' | 'failed'

type CodeFlowStep = {
  key: string
  title: string
  description: string
  offsetMs: number
}

type CodeTypeOption = {
  value: CodeType
  label: string
  detail: string
}

type CodeFlowState = {
  status: CodeFlowStatus
  activeIndex: number
  elapsedMs: number
  percent: number
  label: string
  tone: 'idle' | 'ok' | 'warning' | 'danger' | 'done'
  error: string
}

const navItems: NavItem[] = [
  { path: '/', label: '首页', icon: Home },
  { path: '/accounts', label: '账号管理', icon: UsersRound },
  { path: '/scan', label: '扫码登录', icon: ScanLine },
  { path: '/code', label: '获取 Code', icon: Code2 },
  { path: '/runs', label: '运行结果', icon: ListChecks },
]

const legacyCodeFlowSteps: CodeFlowStep[] = [
  {
    key: 'submit',
    title: '提交运行',
    description: '创建换码请求并校验账号与 appid',
    offsetMs: 0,
  },
  {
    key: 'fresh',
    title: '刷新登录态',
    description: '续期账号令牌并准备授权上下文',
    offsetMs: 2_000,
  },
  {
    key: 'login-buffer',
    title: '取登录缓冲',
    description: '向应用宝请求本次换码所需 login_buffer',
    offsetMs: 5_000,
  },
  {
    key: 'manualauth',
    title: 'ManualAuth',
    description: '使用账号 TDI 与长连接完成协议鉴权',
    offsetMs: 11_000,
  },
  {
    key: 'js-login',
    title: 'js-login',
    description: '提交目标小程序 appid 并解析 jscode',
    offsetMs: 18_000,
  },
  {
    key: 'finish',
    title: '写入结果',
    description: '保存运行结果并同步账号 TDI 状态',
    offsetMs: CODE_RUN_TIMEOUT_MS,
  },
]

const httpCodeFlowSteps: CodeFlowStep[] = [
  {
    key: 'submit',
    title: '提交运行',
    description: '创建换码请求并校验账号与 appid',
    offsetMs: 0,
  },
  {
    key: 'refresh',
    title: '刷新登录态',
    description: '续期账号令牌并确认 unionid',
    offsetMs: 1_000,
  },
  {
    key: 'pc-yyb-login',
    title: 'pc_yyb 换码',
    description: '发送签名请求并读取 login_code',
    offsetMs: 2_000,
  },
  {
    key: 'finish',
    title: '写入结果',
    description: '保存运行结果并同步账号令牌',
    offsetMs: CODE_RUN_TIMEOUT_MS,
  },
]

const codeTypeOptions: CodeTypeOption[] = [
  {
    value: 2,
    label: 'HTTP',
    detail: 'pc_yyb',
  },
  {
    value: 1,
    label: 'Native',
    detail: 'ManualAuth',
  },
]

function App() {
  const [apiBaseUrl, setApiBaseUrl] = usePersistentApiBaseUrl()
  const [recentRuns, setRecentRuns] = useRecentRuns(apiBaseUrl)

  const addRecentRun = (run: ExchangeRun) => {
    setRecentRuns((current) => {
      const next = [run, ...current.filter((item) => item.id !== run.id)]
      return next.slice(0, 20)
    })
  }

  return (
    <AppShell apiBaseUrl={apiBaseUrl} setApiBaseUrl={setApiBaseUrl}>
      <Routes>
        <Route path="/" element={<Dashboard recentRuns={recentRuns} />} />
        <Route path="/accounts" element={<AccountsPage />} />
        <Route path="/scan" element={<ScanPage />} />
        <Route
          path="/code"
          element={<CodePage addRecentRun={addRecentRun} />}
        />
        <Route
          path="/runs"
          element={
            <RunsPage
              recentRuns={recentRuns}
              addRecentRun={addRecentRun}
              clearRecentRuns={() => setRecentRuns([])}
            />
          }
        />
      </Routes>
    </AppShell>
  )
}

function AppShell({
  apiBaseUrl,
  setApiBaseUrl,
  children,
}: {
  apiBaseUrl: string
  setApiBaseUrl: Dispatch<SetStateAction<string>>
  children: ReactNode
}) {
  const location = useLocation()
  const queryClient = useQueryClient()
  const active = navItems.find((item) => item.path === location.pathname)
  const [apiSettingsOpen, setApiSettingsOpen] = useState(false)
  const [apiInput, setApiInput] = useState(apiBaseUrl)
  const [apiSettingsError, setApiSettingsError] = useState('')
  const service = useQuery({
    queryKey: ['service-status', apiBaseUrl],
    queryFn: api.accounts,
    refetchInterval: 30_000,
    retry: false,
  })

  useEffect(() => {
    if (apiSettingsOpen) {
      setApiInput(apiBaseUrl)
      setApiSettingsError('')
    }
  }, [apiBaseUrl, apiSettingsOpen])

  const saveApiSettings = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    try {
      const next = saveApiBaseUrl(apiInput)
      setApiBaseUrl(next)
      setApiSettingsOpen(false)
      queryClient.invalidateQueries()
    } catch (error) {
      setApiSettingsError(errorMessage(error))
    }
  }

  const useCurrentOriginApi = () => {
    const next = saveApiBaseUrl('')
    setApiInput(next)
    setApiBaseUrl(next)
    setApiSettingsOpen(false)
    queryClient.invalidateQueries()
  }

  return (
    <ApiBaseUrlContext.Provider value={apiBaseUrl}>
      <div className="app-shell">
        <aside className="sidebar" aria-label="主导航">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            YY
          </div>
          <div>
            <div className="brand-name">YYB 管理后台</div>
            <div className="brand-subtitle">auth console</div>
          </div>
        </div>

        <nav className="nav-list">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                className={({ isActive }) =>
                  isActive ? 'nav-link active' : 'nav-link'
                }
              >
                <Icon size={18} aria-hidden="true" />
                <span>{item.label}</span>
              </NavLink>
            )
          })}
        </nav>

        <div className="sidebar-status">
          <span
            className={service.isError ? 'status-dot danger' : 'status-dot ok'}
          />
          <div>
            <div className="sidebar-status-title">服务状态</div>
            <div className="sidebar-status-text">
              {service.isError ? '连接异常' : '运行中'}
            </div>
          </div>
        </div>
        </aside>

        <div className="workspace">
          <header className="topbar">
            <div>
              <h1>{active?.label ?? '控制台'}</h1>
            </div>
            <div className="topbar-actions">
              <div className="service-control">
                <button
                  type="button"
                  className={
                    service.isError
                      ? 'service-pill service-button error'
                      : 'service-pill service-button'
                  }
                  onClick={() => setApiSettingsOpen((value) => !value)}
                  aria-expanded={apiSettingsOpen}
                >
                  <Server size={16} aria-hidden="true" />
                  <span>{service.isError ? '后端未连接' : '接口地址'}</span>
                  <strong title={apiBaseLabel(apiBaseUrl)}>
                    {apiBaseLabel(apiBaseUrl)}
                  </strong>
                  <Settings size={14} aria-hidden="true" />
                </button>
                {apiSettingsOpen ? (
                  <form className="api-settings-panel" onSubmit={saveApiSettings}>
                    <label>
                      <span>接口地址</span>
                      <input
                        value={apiInput}
                        onChange={(event) => setApiInput(event.target.value)}
                        placeholder="http://127.0.0.1:8080"
                        autoFocus
                      />
                    </label>
                    {apiSettingsError ? (
                      <p className="api-settings-error">{apiSettingsError}</p>
                    ) : null}
                    <div className="api-settings-actions">
                      <button
                        type="button"
                        className="button"
                        onClick={useCurrentOriginApi}
                      >
                        使用当前站点
                      </button>
                      <button type="submit" className="button primary">
                        保存
                      </button>
                    </div>
                  </form>
                ) : null}
              </div>
              <div className="user-chip" aria-label="当前用户">
                <span>A</span>
                admin
              </div>
            </div>
          </header>

          <main className="content">{children}</main>
        </div>
      </div>
    </ApiBaseUrlContext.Provider>
  )
}

function Dashboard({ recentRuns }: { recentRuns: ExchangeRun[] }) {
  const navigate = useNavigate()
  const accounts = useAccountsQuery()
  const latestAccount = accounts.data?.[0]
  const latestRun = recentRuns[0]

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div className="hero-copy">
          <p className="page-kicker">本地工具台</p>
          <h2>从扫码账号到小程序 code 的最短工作流</h2>
          <p>
            账号按 <code>unionid</code> 管理，TDI 保存在后端数据库里。这里不展示虚构统计，
            只展示当前可以操作和复查的真实状态。
          </p>
        </div>
        <div className="hero-actions">
          <button
            type="button"
            className="button primary"
            onClick={() => navigate('/scan')}
          >
            <QrCode size={16} />
            扫码登录
          </button>
          <button
            type="button"
            className="button"
            onClick={() => navigate('/code')}
          >
            <Code2 size={16} />
            获取 Code
          </button>
        </div>
      </section>

      <div className="dashboard-grid">
        <section className="panel">
          <PanelHeader
            title="最近账号"
            description="来自后端数据库，敏感字段默认隐藏"
            action={
              <button className="text-button" onClick={() => navigate('/accounts')}>
                查看全部
              </button>
            }
          />
          {accounts.isLoading ? (
            <SkeletonRows rows={4} />
          ) : latestAccount ? (
            <AccountSummary account={latestAccount} />
          ) : (
            <EmptyState
              icon={UsersRound}
              title="还没有账号"
              description="先创建扫码会话，完成确认后账号会自动入库。"
              actionLabel="去扫码"
              onAction={() => navigate('/scan')}
            />
          )}
        </section>

        <section className="panel">
          <PanelHeader
            title="最近换码"
            description="只显示当前接口地址下的本地运行结果"
            action={
              <button className="text-button" onClick={() => navigate('/runs')}>
                查看记录
              </button>
            }
          />
          {latestRun ? (
            <RunSummary run={latestRun} />
          ) : (
            <EmptyState
              icon={Code2}
              title="还没有运行结果"
              description="选择账号并提交 appid 后，这里会显示最近一次结果。"
              actionLabel="去获取 Code"
              onAction={() => navigate('/code')}
            />
          )}
        </section>
      </div>
    </div>
  )
}

function AccountsPage() {
  const accounts = useAccountsQuery()
  const apiBaseUrl = useCurrentApiBaseUrl()
  const [selectedUnionid, setSelectedUnionid] = useState<string>('')
  const [showSecrets, setShowSecrets] = useState(false)
  const selected = accounts.data?.find((item) => item.unionid === selectedUnionid)

  const closeAccountDetails = () => {
    setSelectedUnionid('')
    setShowSecrets(false)
  }

  const toggleAccountDetails = (unionid: string) => {
    if (unionid === selectedUnionid) {
      closeAccountDetails()
      return
    }
    setSelectedUnionid(unionid)
    setShowSecrets(false)
  }

  useEffect(() => {
    closeAccountDetails()
  }, [apiBaseUrl])

  return (
    <div className="page-stack">
      <section className="section-toolbar">
        <div>
          <h2>账号管理</h2>
          <p>按 <code>unionid</code> 维护账号、设备和 TDI 状态。</p>
        </div>
        <button
          type="button"
          className="button"
          onClick={() => accounts.refetch()}
          disabled={accounts.isFetching}
        >
          <RefreshCcw size={16} className={accounts.isFetching ? 'spin' : ''} />
          刷新
        </button>
      </section>

      <div className={selected ? 'split-layout' : 'single-layout'}>
        <section className="panel table-panel">
          <PanelHeader
            title="账号列表"
            description="不会显示后端自增 ID，账号身份以 unionid 为准"
          />
          {accounts.isLoading ? (
            <SkeletonRows rows={7} />
          ) : accounts.isError ? (
            <ErrorState message={errorMessage(accounts.error)} />
          ) : accounts.data && accounts.data.length > 0 ? (
            <div className="table-wrap">
              <table className="account-table">
                <colgroup>
                  <col className="account-col-id" />
                  <col className="account-col-id" />
                  <col className="account-col-short" />
                  <col className="account-col-short" />
                  <col className="account-col-time" />
                  <col className="account-col-action" />
                </colgroup>
                <thead>
                  <tr>
                    <th>UnionID</th>
                    <th>OpenID</th>
                    <th>设备</th>
                    <th>TDI</th>
                    <th>更新时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.data.map((account) => (
                    <tr
                      key={account.unionid}
                      className={
                        account.unionid === selectedUnionid ? 'selected-row' : ''
                      }
                    >
                      <td>
                        <MonoText value={account.unionid} />
                      </td>
                      <td>
                        <MonoText value={account.openid} />
                      </td>
                      <td>{account.device_id_b64 ? '已生成' : '缺失'}</td>
                      <td>
                        <StatusTag
                          status={hasPersistedTDI(account) ? 'succeeded' : 'failed'}
                          label={hasPersistedTDI(account) ? '已入库' : '缺失'}
                        />
                      </td>
                      <td>{formatTime(account.updated_at)}</td>
                      <td>
                        <button
                          type="button"
                          className="text-button"
                          aria-pressed={account.unionid === selectedUnionid}
                          onClick={() => toggleAccountDetails(account.unionid)}
                        >
                          {account.unionid === selectedUnionid ? '收起' : '查看'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon={UsersRound}
              title="暂无账号"
              description="完成一次扫码登录后，账号会自动出现在这里。"
            />
          )}
        </section>

        {selected ? (
          <aside className="panel details-panel">
            <PanelHeader
              title="账号详情"
              description="TDI 与令牌是敏感信息，默认遮罩"
              action={
                <>
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => setShowSecrets((value) => !value)}
                    aria-label={showSecrets ? '隐藏敏感字段' : '显示敏感字段'}
                  >
                    {showSecrets ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    onClick={closeAccountDetails}
                    aria-label="关闭账号详情"
                  >
                    <X size={16} />
                  </button>
                </>
              }
            />
            <DefinitionList
              rows={[
                ['unionid', selected.unionid],
                ['openid', selected.openid],
                ['username', selected.username],
                ['uin', selected.uin || '-'],
                ['device_id_b64', selected.device_id_b64],
                ['app_device_id', selected.app_device_id],
                ['server_id_b64', selected.server_id_b64 || '-'],
                ['autoauth_key_b64', selected.autoauth_key_b64 || '-'],
                ['autoauth_enc_key_b64', selected.autoauth_enc_key_b64 || '-'],
                ['access_token', selected.access_token],
                ['refresh_token', selected.refresh_token],
              ]}
              reveal={showSecrets}
              sensitiveKeys={[
                'device_id_b64',
                'server_id_b64',
                'autoauth_key_b64',
                'autoauth_enc_key_b64',
                'access_token',
                'refresh_token',
              ]}
            />
          </aside>
        ) : null}
      </div>
    </div>
  )
}

function ScanPage() {
  const queryClient = useQueryClient()
  const apiBaseUrl = useCurrentApiBaseUrl()
  const [scan, setScan] = useState<ScanSession | null>(null)
  const [pollError, setPollError] = useState('')
  const countdown = useScanCountdown(scan)
  const scanID = scan?.id
  const scanStatus = scan?.status

  const createScan = useMutation({
    mutationFn: api.createScan,
    onSuccess: (next) => {
      setPollError('')
      setScan(next)
    },
  })

  const applyPolledScan = useCallback(
    (next: ScanSession) => {
      setPollError('')
      setScan(next)
      if (next.status === 'completed') {
        queryClient.invalidateQueries({ queryKey: ['accounts'] })
      }
    },
    [queryClient],
  )

  const pollScanByID = useCallback(
    async (scanID: number) => {
      try {
        const next = await api.pollScan(scanID)
        applyPolledScan(next)
      } catch (error) {
        setPollError(errorMessage(error))
      }
    },
    [applyPolledScan],
  )

  const pollCurrentScan = () => {
    if (!scan || isTerminalScan(scan.status)) {
      return
    }
    void pollScanByID(scan.id)
  }

  useEffect(() => {
    if (!scanID || !scanStatus || isTerminalScan(scanStatus)) {
      return
    }

    let stopped = false
    let inFlight = false

    const poll = async () => {
      if (stopped || inFlight) {
        return
      }
      inFlight = true
      try {
        const next = await api.pollScan(scanID)
        if (!stopped) {
          applyPolledScan(next)
        }
      } catch (error) {
        if (!stopped) {
          setPollError(errorMessage(error))
        }
      } finally {
        inFlight = false
      }
    }

    void poll()
    const timer = window.setInterval(poll, 3000)
    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [applyPolledScan, scanID, scanStatus])

  useEffect(() => {
    setScan(null)
    setPollError('')
  }, [apiBaseUrl])

  return (
    <div className="page-stack">
      <section className="section-toolbar">
        <div>
          <h2>扫码登录</h2>
          <p>创建微信扫码会话，确认后自动写入账号和每账号 TDI 状态。</p>
        </div>
        <button
          type="button"
          className="button primary"
          onClick={() => createScan.mutate()}
          disabled={createScan.isPending}
        >
          {createScan.isPending ? (
            <Loader2 size={16} className="spin" />
          ) : (
            <QrCode size={16} />
          )}
          创建扫码会话
        </button>
      </section>

      <div className="scan-layout">
        <section className="panel qr-panel">
          <PanelHeader
            title="二维码"
            description="有效期约 2 分钟，扫码后保持本页等待状态更新"
            action={
              scan && !isTerminalScan(scan.status) ? (
                <button className="text-button" onClick={pollCurrentScan}>
                  立即轮询
                </button>
              ) : null
            }
          />
          {createScan.isError ? (
            <ErrorState message={errorMessage(createScan.error)} />
          ) : scan ? (
            <div className="qr-stage">
              <div className="qr-box">
                <img src={scan.qr_url} alt="微信扫码登录二维码" />
              </div>
              <div className="scan-meta">
                <StatusTag status={scan.status} label={scanStatusLabel(scan.status)} />
                <span>scan_id #{scan.id}</span>
                <span className={`countdown-pill ${countdown.tone}`}>
                  <Clock3 size={14} aria-hidden="true" />
                  {countdown.label}
                </span>
              </div>
              <div
                className={`countdown-track ${countdown.tone}`}
                aria-label={countdown.label}
              >
                <span style={{ width: `${countdown.percent}%` }} />
              </div>
              {pollError ? <p className="inline-error">{pollError}</p> : null}
            </div>
          ) : (
            <EmptyState
              icon={QrCode}
              title="等待创建扫码会话"
              description="点击右上角按钮后，这里会显示二维码和轮询状态。"
            />
          )}
        </section>

        <section className="panel">
          <PanelHeader
            title="状态流"
            description="这里显示本次扫码从等待到入库的实际阶段"
          />
          <ol className="step-list">
            {[
              ['waiting', '创建会话', '后端生成 scan_id 和二维码'],
              ['scanned', '用户扫码', '微信已读取二维码，等待确认'],
              ['authorized', '授权确认', '拿到 wx_code 并准备 OAuth'],
              ['completed', '账号入库', '写入账号与 TDI 状态'],
            ].map(([status, title, description]) => (
              <li
                key={status}
                className={
                  scan && stepReached(scan.status, status as ScanStatus)
                    ? 'reached'
                    : ''
                }
              >
                <span className="step-dot" />
                <div>
                  <strong>{title}</strong>
                  <p>{description}</p>
                </div>
              </li>
            ))}
          </ol>

          {scan?.status === 'completed' ? (
            <div className="success-box">
              <ShieldCheck size={18} />
              <div>
                <strong>账号已入库</strong>
                <MonoText value={scan.account_unionid || scan.unionid} />
              </div>
            </div>
          ) : null}

          {scan?.status === 'failed' || scan?.status === 'expired' ? (
            <ErrorState message={scan.error || scanStatusLabel(scan.status)} />
          ) : null}
        </section>
      </div>
    </div>
  )
}

function CodePage({
  addRecentRun,
}: {
  addRecentRun: (run: ExchangeRun) => void
}) {
  const queryClient = useQueryClient()
  const apiBaseUrl = useCurrentApiBaseUrl()
  const accounts = useAccountsQuery()
  const [unionid, setUnionid] = useState('')
  const [appid, setAppid] = useState('')
  const [codeType, setCodeType] = useState<CodeType>(2)
  const [lastRun, setLastRun] = useState<ExchangeRun | null>(null)
  const [copied, setCopied] = useState(false)
  const [exchangeStartedAt, setExchangeStartedAt] = useState<number | null>(null)
  const accountOptions = accounts.data ?? []
  const selectedUnionid = accountOptions.some((account) => account.unionid === unionid)
    ? unionid
    : accountOptions[0]?.unionid ?? ''

  useEffect(() => {
    setUnionid('')
    setLastRun(null)
    setCopied(false)
    setExchangeStartedAt(null)
  }, [apiBaseUrl])

  const exchange = useMutation({
    mutationFn: () => api.exchangeCode(selectedUnionid, appid.trim(), codeType),
    onMutate: () => {
      setLastRun(null)
      setCopied(false)
      setExchangeStartedAt(Date.now())
    },
    onSuccess: (run) => {
      setLastRun(run)
      addRecentRun(run)
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
    },
  })

  const canSubmit = Boolean(selectedUnionid && appid.trim() && !exchange.isPending)
  const codeFlow = useCodeFlow(
    exchange.isPending,
    exchangeStartedAt,
    lastRun,
    exchange.isError ? exchange.error : null,
    codeFlowStepsForType(codeType),
  )

  const copyCode = async () => {
    if (!lastRun?.code) {
      return
    }
    await navigator.clipboard.writeText(lastRun.code)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }

  const submitExchange = (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault()
    if (canSubmit) {
      exchange.mutate()
    }
  }

  return (
    <div className="page-stack">
      <section className="section-toolbar">
        <div>
          <h2>获取 Code</h2>
          <p>选择账号、链路和目标小程序 <code>appid</code>，同步执行换码。</p>
        </div>
        <button
          type="submit"
          form="code-exchange-form"
          className="button primary"
          disabled={!canSubmit}
        >
          {exchange.isPending ? (
            <Loader2 size={16} className="spin" />
          ) : (
            <Play size={16} />
          )}
          获取 Code
        </button>
      </section>

      <div className="code-layout">
        <section className="panel form-panel">
          <PanelHeader
            title="运行参数"
            description="type=1 走 Native，type=2 走 pc_yyb HTTP"
          />
          <form
            id="code-exchange-form"
            className="form-grid"
            onSubmit={submitExchange}
          >
            <label>
              <span>账号 unionid</span>
              <select
                value={selectedUnionid}
                disabled={accountOptions.length === 0}
                onChange={(event) => setUnionid(event.target.value)}
              >
                {accountOptions.length === 0 ? (
                  <option value="">暂无账号</option>
                ) : null}
                {accountOptions.map((account) => (
                  <option key={account.unionid} value={account.unionid}>
                    {account.unionid}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>AppID</span>
              <input
                value={appid}
                onChange={(event) => setAppid(event.target.value)}
                placeholder="输入目标小程序 appid"
              />
            </label>
            <fieldset className="code-type-fieldset">
              <legend>链路类型</legend>
              <div className="segmented-control">
                {codeTypeOptions.map((option) => (
                  <label key={option.value}>
                    <input
                      type="radio"
                      name="code-type"
                      value={option.value}
                      checked={codeType === option.value}
                      onChange={() => setCodeType(option.value)}
                    />
                    <span>
                      <strong>{option.label}</strong>
                      <small>type={option.value} · {option.detail}</small>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          </form>

          {accounts.isLoading ? <SkeletonRows rows={2} /> : null}
          {accounts.isError ? <ErrorState message={errorMessage(accounts.error)} /> : null}
          {!accounts.isLoading && accounts.data?.length === 0 ? (
            <EmptyState
              icon={UsersRound}
              title="还没有可用账号"
              description="请先完成一次扫码登录，再回来获取 code。"
            />
          ) : null}
          {exchange.isError ? <ErrorState message={errorMessage(exchange.error)} /> : null}
        </section>

        <section className="panel result-panel">
          <PanelHeader
            title="状态流"
            description="同步请求执行中显示阶段，最终以后端返回结果为准"
            action={
              lastRun?.code ? (
                <button className="icon-button" onClick={copyCode} aria-label="复制 code">
                  <Copy size={16} />
                </button>
              ) : null
            }
          />
          <CodeStatusFlow
            flow={codeFlow}
            lastRun={lastRun}
            copied={copied}
            steps={codeFlowStepsForType(codeType)}
          />
        </section>
      </div>
    </div>
  )
}

function CodeStatusFlow({
  flow,
  lastRun,
  copied,
  steps,
}: {
  flow: CodeFlowState
  lastRun: ExchangeRun | null
  copied: boolean
  steps: CodeFlowStep[]
}) {
  return (
    <div className="code-flow">
      <ol className="step-list">
        {steps.map((step, index) => {
          const reached = shouldReachCodeStep(flow, index)
          const current = flow.status === 'running' && index === flow.activeIndex
          const failed = flow.status === 'failed' && index === flow.activeIndex
          return (
            <li
              key={step.key}
              className={[
                reached ? 'reached' : '',
                current ? 'current' : '',
                failed ? 'failed' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <span className="step-dot" />
              <div>
                <strong>{step.title}</strong>
                <p>{step.description}</p>
              </div>
            </li>
          )
        })}
      </ol>

      <div className="code-progress">
        <div className="scan-meta">
          <StatusTag
            status={codeFlowTagStatus(flow.status)}
            label={codeFlowStatusLabel(flow.status)}
          />
          <span className={`countdown-pill ${flow.tone}`}>
            <Clock3 size={14} aria-hidden="true" />
            {flow.label}
          </span>
        </div>
        <div className={`countdown-track ${flow.tone}`} aria-label={flow.label}>
          <span style={{ width: `${flow.percent}%` }} />
        </div>
      </div>

      {lastRun ? (
        <RunDetail run={lastRun} copied={copied} />
      ) : flow.status === 'failed' ? (
        <ErrorState message={flow.error || '请求失败'} />
      ) : flow.status === 'idle' ? (
        <EmptyState
          icon={Code2}
          title="等待运行"
          description="点击获取后，这里会显示阶段、code、错误和耗时信息。"
        />
      ) : null}
    </div>
  )
}

function RunsPage({
  recentRuns,
  addRecentRun,
  clearRecentRuns,
}: {
  recentRuns: ExchangeRun[]
  addRecentRun: (run: ExchangeRun) => void
  clearRecentRuns: () => void
}) {
  const [runId, setRunId] = useState('')
  const lookup = useMutation({
    mutationFn: () => api.run(Number(runId)),
    onSuccess: addRecentRun,
  })

  return (
    <div className="page-stack">
      <section className="section-toolbar">
        <div>
          <h2>运行结果</h2>
          <p>后端当前支持按 run_id 查询；完整列表等后端提供列表接口后接入。</p>
        </div>
        <button
          type="button"
          className="button"
          onClick={clearRecentRuns}
          disabled={recentRuns.length === 0}
        >
          清空本地记录
        </button>
      </section>

      <section className="panel">
        <PanelHeader title="按 run_id 查询" description="用于复查某次后端运行结果" />
        <div className="inline-form">
          <input
            value={runId}
            inputMode="numeric"
            onChange={(event) => setRunId(event.target.value)}
            placeholder="输入 run_id"
          />
          <button
            type="button"
            className="button primary"
            disabled={!Number(runId) || lookup.isPending}
            onClick={() => lookup.mutate()}
          >
            {lookup.isPending ? <Loader2 className="spin" size={16} /> : <RefreshCcw size={16} />}
            查询
          </button>
        </div>
        {lookup.isError ? <ErrorState message={errorMessage(lookup.error)} /> : null}
      </section>

      <section className="panel table-panel">
        <PanelHeader
          title="本地最近运行"
          description="按当前接口地址隔离保存，不混用其它后端结果"
        />
        {recentRuns.length > 0 ? (
          <RunsTable runs={recentRuns} />
        ) : (
          <EmptyState
            icon={ListChecks}
            title="暂无运行记录"
            description="从获取 Code 页面执行成功或失败后，这里会出现记录。"
          />
        )}
      </section>
    </div>
  )
}

function PanelHeader({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="panel-header">
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      {action ? <div className="panel-action">{action}</div> : null}
    </div>
  )
}

function AccountSummary({ account }: { account: Account }) {
  return (
    <div className="summary-stack">
      <div className="summary-line">
        <span>UnionID</span>
        <MonoText value={account.unionid} />
      </div>
      <div className="summary-line">
        <span>OpenID</span>
        <MonoText value={account.openid} />
      </div>
      <div className="summary-line">
        <span>TDI</span>
        <StatusTag
          status={hasPersistedTDI(account) ? 'succeeded' : 'failed'}
          label={hasPersistedTDI(account) ? '已入库' : '缺失'}
        />
      </div>
      <div className="summary-line">
        <span>更新时间</span>
        <strong>{formatTime(account.updated_at)}</strong>
      </div>
    </div>
  )
}

function RunSummary({ run }: { run: ExchangeRun }) {
  return (
    <div className="summary-stack">
      <div className="summary-line">
        <span>状态</span>
        <StatusTag status={run.status} label={runStatusLabel(run.status)} />
      </div>
      <div className="summary-line">
        <span>AppID</span>
        <MonoText value={run.appid} />
      </div>
      <div className="summary-line">
        <span>Code</span>
        <MonoText value={run.code || run.error || '-'} />
      </div>
      <div className="summary-line">
        <span>完成时间</span>
        <strong>{formatTime(run.finished_at || run.started_at)}</strong>
      </div>
    </div>
  )
}

function RunDetail({ run, copied }: { run: ExchangeRun; copied: boolean }) {
  return (
    <div className="run-detail">
      <StatusTag status={run.status} label={runStatusLabel(run.status)} />
      <DefinitionList
        rows={[
          ['run_id', String(run.id)],
          ['account_unionid', run.account_unionid || '-'],
          ['appid', run.appid],
          ['code', run.code || '-'],
          ['error', run.error || '-'],
          ['started_at', formatTime(run.started_at)],
          ['finished_at', formatTime(run.finished_at)],
        ]}
        reveal
        sensitiveKeys={[]}
      />
      {copied ? <p className="copy-note">已复制 code</p> : null}
    </div>
  )
}

function RunsTable({ runs }: { runs: ExchangeRun[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>run_id</th>
            <th>账号</th>
            <th>appid</th>
            <th>状态</th>
            <th>code / error</th>
            <th>开始时间</th>
            <th>完成时间</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.id}>
              <td>#{run.id}</td>
              <td>
                <MonoText value={run.account_unionid || '-'} />
              </td>
              <td>
                <MonoText value={run.appid} />
              </td>
              <td>
                <StatusTag status={run.status} label={runStatusLabel(run.status)} />
              </td>
              <td>
                <MonoText value={run.code || run.error || '-'} />
              </td>
              <td>{formatTime(run.started_at)}</td>
              <td>{formatTime(run.finished_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DefinitionList({
  rows,
  reveal,
  sensitiveKeys,
}: {
  rows: Array<[string, string]>
  reveal: boolean
  sensitiveKeys: string[]
}) {
  return (
    <dl className="definition-list">
      {rows.map(([key, value]) => {
        const sensitive = sensitiveKeys.includes(key)
        return (
          <div key={key}>
            <dt>{key}</dt>
            <dd>
              <MonoText value={sensitive && !reveal ? mask(value) : value} />
            </dd>
          </div>
        )
      })}
    </dl>
  )
}

function StatusTag({
  status,
  label,
}: {
  status: ScanStatus | ExchangeStatus | 'idle'
  label: string
}) {
  return (
    <span className={`status-tag ${status}`}>
      <span className="status-dot" />
      {label}
    </span>
  )
}

function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: typeof Home
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <div className="empty-state">
      <Icon size={24} aria-hidden="true" />
      <strong>{title}</strong>
      <p>{description}</p>
      {actionLabel && onAction ? (
        <button type="button" className="button" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="error-state" role="alert">
      <AlertCircle size={18} aria-hidden="true" />
      <span>{message}</span>
    </div>
  )
}

function SkeletonRows({ rows }: { rows: number }) {
  return (
    <div className="skeleton-stack" aria-label="加载中">
      {Array.from({ length: rows }).map((_, index) => (
        <span key={index} className="skeleton-row" />
      ))}
    </div>
  )
}

function MonoText({ value }: { value: string }) {
  return (
    <code className="mono-text" title={value}>
      {value}
    </code>
  )
}

function useAccountsQuery() {
  const apiBaseUrl = useCurrentApiBaseUrl()
  return useQuery({
    queryKey: ['accounts', apiBaseUrl],
    queryFn: api.accounts,
    retry: false,
  })
}

function useCurrentApiBaseUrl() {
  return useContext(ApiBaseUrlContext)
}

function usePersistentApiBaseUrl() {
  const [apiBaseUrl, setApiBaseUrl] = useState(() => getApiBaseUrl())

  useEffect(() => {
    const syncApiBaseUrl = () => setApiBaseUrl(getApiBaseUrl())
    window.addEventListener('storage', syncApiBaseUrl)
    return () => window.removeEventListener('storage', syncApiBaseUrl)
  }, [])

  return [apiBaseUrl, setApiBaseUrl] as const
}

function useScanCountdown(scan: ScanSession | null) {
  const [now, setNow] = useState(() => Date.now())
  const scanID = scan?.id
  const scanStatus = scan?.status

  useEffect(() => {
    if (!scanStatus || isTerminalScan(scanStatus)) {
      return
    }
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [scanID, scanStatus])

  return getScanCountdown(scan, now)
}

function useCodeFlow(
  isRunning: boolean,
  startedAt: number | null,
  lastRun: ExchangeRun | null,
  error: unknown,
  steps: CodeFlowStep[],
) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!isRunning) {
      return
    }
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [isRunning, startedAt])

  return getCodeFlowState(isRunning, startedAt, lastRun, error, now, steps)
}

function hasPersistedTDI(account: Account) {
  return [
    account.device_id_b64,
    account.app_device_id,
    account.username,
    account.uin,
    account.server_id_b64,
    account.autoauth_key_b64,
    account.autoauth_enc_key_b64,
  ].some((value) => value.trim().length > 0)
}

function useRecentRuns(apiBaseUrl: string) {
  const storageKey = recentRunsStorageKey(apiBaseUrl)
  const [state, setState] = useState(() => ({
    runs: readRecentRuns(storageKey),
    storageKey,
  }))

  useEffect(() => {
    window.localStorage.removeItem(RECENT_RUNS_KEY)
  }, [])

  useEffect(() => {
    setState({
      runs: readRecentRuns(storageKey),
      storageKey,
    })
  }, [storageKey])

  useEffect(() => {
    if (state.storageKey !== storageKey) {
      return
    }
    writeRecentRuns(state.storageKey, state.runs)
  }, [state, storageKey])

  const setRuns: Dispatch<SetStateAction<ExchangeRun[]>> = (next) => {
    setState((current) => {
      const currentRuns =
        current.storageKey === storageKey
          ? current.runs
          : readRecentRuns(storageKey)
      const runs = typeof next === 'function' ? next(currentRuns) : next
      return { runs, storageKey }
    })
  }

  return [state.storageKey === storageKey ? state.runs : [], setRuns] as const
}

function recentRunsStorageKey(apiBaseUrl: string) {
  return `${RECENT_RUNS_KEY}:${encodeURIComponent(apiBaseUrl || 'current-site-api')}`
}

function readRecentRuns(storageKey: string) {
  try {
    const raw = window.localStorage.getItem(storageKey)
    return raw ? (JSON.parse(raw) as ExchangeRun[]) : []
  } catch {
    return []
  }
}

function writeRecentRuns(storageKey: string, runs: ExchangeRun[]) {
  if (runs.length > 0) {
    window.localStorage.setItem(storageKey, JSON.stringify(runs))
  } else {
    window.localStorage.removeItem(storageKey)
  }
}

function getScanCountdown(scan: ScanSession | null, now: number) {
  if (!scan) {
    return { label: '等待创建', percent: 0, tone: 'idle' }
  }

  if (scan.status === 'completed') {
    return { label: '已完成', percent: 100, tone: 'done' }
  }
  if (scan.status === 'failed') {
    return { label: '已失败', percent: 0, tone: 'danger' }
  }
  if (scan.status === 'canceled') {
    return { label: '已取消', percent: 0, tone: 'danger' }
  }
  if (scan.status === 'expired') {
    return { label: '已过期', percent: 0, tone: 'danger' }
  }

  const expiresAt = Date.parse(scan.expires_at)
  const createdAt = Date.parse(scan.created_at)
  if (Number.isNaN(expiresAt)) {
    return { label: '等待过期时间', percent: 0, tone: 'idle' }
  }

  const remainingMs = Math.max(0, expiresAt - now)
  const totalMs = Number.isNaN(createdAt)
    ? 120_000
    : Math.max(1, expiresAt - createdAt)
  const percent = Math.max(0, Math.min(100, (remainingMs / totalMs) * 100))
  const tone = remainingMs <= 0 ? 'danger' : remainingMs <= 30_000 ? 'warning' : 'ok'

  return {
    label: remainingMs <= 0 ? '已过期' : `剩余 ${formatCountdown(remainingMs)}`,
    percent,
    tone,
  }
}

function getCodeFlowState(
  isRunning: boolean,
  startedAt: number | null,
  lastRun: ExchangeRun | null,
  error: unknown,
  now: number,
  steps: CodeFlowStep[],
): CodeFlowState {
  if (isRunning) {
    const elapsedMs = startedAt ? Math.max(0, now - startedAt) : 0
    return {
      status: 'running',
      activeIndex: activeCodeStepIndex(elapsedMs, steps),
      elapsedMs,
      percent: Math.min(99, (elapsedMs / CODE_RUN_TIMEOUT_MS) * 100),
      label: `运行 ${formatCountdown(elapsedMs)} / 01:15`,
      tone: codeProgressTone(elapsedMs),
      error: '',
    }
  }

  if (lastRun) {
    const elapsedMs = exchangeRunElapsed(lastRun)
    const failed = lastRun.status === 'failed'
    return {
      status: lastRun.status === 'succeeded' ? 'succeeded' : 'failed',
      activeIndex: failed
        ? failedCodeStepIndex(lastRun.error, steps)
        : steps.length - 1,
      elapsedMs,
      percent: lastRun.status === 'succeeded'
        ? 100
        : Math.min(100, (elapsedMs / CODE_RUN_TIMEOUT_MS) * 100),
      label: lastRun.status === 'succeeded'
        ? `完成 ${formatCountdown(elapsedMs)}`
        : `失败 ${formatCountdown(elapsedMs)}`,
      tone: lastRun.status === 'succeeded' ? 'done' : 'danger',
      error: lastRun.error,
    }
  }

  if (error) {
    const elapsedMs = startedAt ? Math.max(0, now - startedAt) : 0
    const message = errorMessage(error)
    return {
      status: 'failed',
      activeIndex: failedCodeStepIndex(message, steps),
      elapsedMs,
      percent: Math.min(100, (elapsedMs / CODE_RUN_TIMEOUT_MS) * 100),
      label: elapsedMs > 0 ? `失败 ${formatCountdown(elapsedMs)}` : '请求失败',
      tone: 'danger',
      error: message,
    }
  }

  return {
    status: 'idle',
    activeIndex: -1,
    elapsedMs: 0,
    percent: 0,
    label: '等待运行',
    tone: 'idle',
    error: '',
  }
}

function activeCodeStepIndex(elapsedMs: number, steps: CodeFlowStep[]) {
  let index = 0
  for (const [stepIndex, step] of steps.entries()) {
    if (elapsedMs >= step.offsetMs) {
      index = stepIndex
    }
  }
  return Math.min(index, steps.length - 2)
}

function failedCodeStepIndex(message: string, steps: CodeFlowStep[]) {
  const text = message.toLowerCase()
  const pcYYBStep = steps.findIndex((step) => step.key === 'pc-yyb-login')
  if (pcYYBStep >= 0 && (text.includes('login code') || text.includes('-109') || text.includes('-105'))) {
    return pcYYBStep
  }
  if (text.includes('login buffer') || text.includes('unionid')) {
    return stepIndexByKey(steps, 'login-buffer', 1)
  }
  if (text.includes('manualauth')) {
    return stepIndexByKey(steps, 'manualauth', 1)
  }
  if (text.includes('js-login') || text.includes('jscode')) {
    return stepIndexByKey(steps, 'js-login', steps.length - 2)
  }
  if (text.includes('refresh token') || text.includes('token')) {
    return stepIndexByKey(steps, 'refresh', 1)
  }
  if (text.includes('timed out') || text.includes('timeout')) {
    return Math.max(0, steps.length - 2)
  }
  return 0
}

function stepIndexByKey(steps: CodeFlowStep[], key: string, fallback: number) {
  const index = steps.findIndex((step) => step.key === key)
  return index >= 0 ? index : Math.min(fallback, steps.length - 1)
}

function exchangeRunElapsed(run: ExchangeRun) {
  const startedAt = Date.parse(run.started_at)
  const finishedAt = Date.parse(run.finished_at || run.started_at)
  if (Number.isNaN(startedAt) || Number.isNaN(finishedAt)) {
    return 0
  }
  return Math.max(0, finishedAt - startedAt)
}

function codeProgressTone(elapsedMs: number): CodeFlowState['tone'] {
  if (elapsedMs >= CODE_RUN_TIMEOUT_MS) {
    return 'danger'
  }
  if (elapsedMs >= 60_000) {
    return 'warning'
  }
  return 'ok'
}

function shouldReachCodeStep(flow: CodeFlowState, index: number) {
  if (flow.status === 'idle') {
    return false
  }
  if (flow.status === 'succeeded') {
    return true
  }
  return index <= flow.activeIndex
}

function codeFlowStepsForType(type: CodeType) {
  return type === 2 ? httpCodeFlowSteps : legacyCodeFlowSteps
}

function formatCountdown(ms: number) {
  const totalSeconds = Math.ceil(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function apiBaseLabel(value: string) {
  return value || '当前站点 /api'
}

function formatTime(value?: string) {
  if (!value) {
    return '-'
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleString('zh-CN', {
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function mask(value: string) {
  if (!value || value === '-') {
    return value
  }
  if (value.length <= 10) {
    return '••••••'
  }
  return `${value.slice(0, 6)}••••${value.slice(-4)}`
}

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }
  return '请求失败'
}

function scanStatusLabel(status: ScanStatus) {
  const labels: Record<ScanStatus, string> = {
    waiting: '等待扫码',
    scanned: '已扫码',
    authorized: '已授权',
    completed: '已入库',
    canceled: '已取消',
    expired: '已过期',
    failed: '失败',
  }
  return labels[status]
}

function runStatusLabel(status: ExchangeStatus) {
  const labels: Record<ExchangeStatus, string> = {
    running: '运行中',
    succeeded: '成功',
    failed: '失败',
  }
  return labels[status]
}

function codeFlowStatusLabel(status: CodeFlowStatus) {
  const labels: Record<CodeFlowStatus, string> = {
    idle: '等待运行',
    running: '运行中',
    succeeded: '成功',
    failed: '失败',
  }
  return labels[status]
}

function codeFlowTagStatus(status: CodeFlowStatus): ScanStatus | ExchangeStatus | 'idle' {
  if (status === 'idle') {
    return 'idle'
  }
  if (status === 'succeeded') {
    return 'succeeded'
  }
  if (status === 'failed') {
    return 'failed'
  }
  return 'running'
}

function stepReached(current: ScanStatus, target: ScanStatus) {
  const order: ScanStatus[] = ['waiting', 'scanned', 'authorized', 'completed']
  if (current === 'failed' || current === 'expired' || current === 'canceled') {
    return order.indexOf(target) <= order.indexOf('scanned')
  }
  return order.indexOf(target) <= order.indexOf(current)
}

export default App
