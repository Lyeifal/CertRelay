const paths = {
  shield: '<path d="m12 3 8 3.5V12c0 5-5.5 8-8 9-2.5-1-8-4-8-9V6.5Z"/><path d="m8.5 12 2.3 2.3 4.8-5"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  certificate: '<rect x="5" y="3" width="14" height="15" rx="2"/><path d="M9 7h6M9 10h4"/><circle cx="12" cy="16" r="3"/><path d="m9.5 18-.5 4 3-1.5 3 1.5-.5-4"/>',
  server: '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="14" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 17.5h.01M12 7.5h5M12 17.5h5"/>',
  activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  settings: '<path d="m9 3-.8 2.5-2.5 1L3 6l-1 3 2 2v2l-2 2 1 3 2.7-.5 2.5 1L9 21h4l.8-2.5 2.5-1 2.7.5 1-3-2-2v-2l2-2-1-3-2.7.5-2.5-1L13 3Z"/><circle cx="11" cy="12" r="3"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  arrowUp: '<path d="M7 17 17 7M7 7h10v10"/>',
  refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  cloud: '<path d="M6 18a4 4 0 0 1-.7-7.9 7 7 0 0 1 13-1.3A4.6 4.6 0 0 1 18 18Z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  alert: '<path d="m10.3 4-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3l-8-14a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 8V3H3v13h5"/>',
  key: '<circle cx="8" cy="8" r="5"/><path d="m11.5 11.5 9 9M17 16l3-3M14 13l3-3"/>',
  cpu: '<rect x="5" y="5" width="14" height="14" rx="2"/><rect x="9" y="9" width="6" height="6" rx="1"/><path d="M9 2v3m6-3v3M9 19v3m6-3v3M2 9h3m-3 6h3m14-6h3m-3 6h3"/>',
  leaf: '<path d="M20 3C10 3 3 7 3 14a7 7 0 0 0 7 7c7 0 10-9 10-18Z"/><path d="M5 19 15 9M9 15v-4M9 15h4"/>',
  book: '<path d="M12 5c-4-3-8-2-10-1v15c3-1 6-1 10 1 4-2 7-2 10-1V4c-2-1-6-2-10 1ZM12 5v15"/>',
};
const icon = (name, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.shield}</svg>`;
const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const dayMs = 86400000;
const now = new Date();
const dateIn = (days) => new Date(now.getTime() + days * dayMs).toLocaleDateString('sv-SE');
const clientSeed = [
  { id: 'hk-main', name: 'hk-main', label: '香港主服务器', location: '香港 · 公网入口', arch: 'amd64', memory: '4 核 / 8 GB', online: true, seen: '刚刚', service: 'Docker Nginx' },
  { id: 'ali-web-01', name: 'aliyun-web-01', label: '阿里云 Web 01', location: '阿里云 · Web 服务', arch: 'amd64', memory: '2 核 / 2 GB', online: true, seen: '2 分钟前', service: 'Nginx' },
  { id: 'ali-web-02', name: 'aliyun-web-02', label: '阿里云 Web 02', location: '阿里云 · Web 服务', arch: 'amd64', memory: '2 核 / 2 GB', online: true, seen: '3 分钟前', service: 'Nginx' },
  { id: 'ali-compute', name: 'aliyun-compute', label: '9950X 计算服务器', location: '阿里云 · 计算服务', arch: 'amd64', memory: '6 核 / 8 GB', online: true, seen: '1 分钟前', service: 'Docker Nginx' },
  { id: 'home-lab', name: 'home-lab', label: '本地实验室', location: '本地 · 12100F', arch: 'amd64', memory: '16 GB', online: true, seen: '4 分钟前', service: 'Docker Nginx' },
  { id: 'dell-ubuntu', name: 'dell-ubuntu', label: 'Dell Ubuntu', location: '本地 · Ubuntu', arch: 'amd64', memory: '12 GB', online: false, seen: '2 小时前', service: 'Nginx' },
];
const certificates = [
  { id: 'cert-1', domain: '*.example.com', root: 'example.com', provider: 'cf', days: 76, version: 'v20261016.1', clients: ['hk-main', 'ali-web-01', 'ali-web-02', 'ali-compute'], stale: [], issued: dateIn(-14) },
  { id: 'cert-2', domain: '*.example.net', root: 'example.net', provider: 'cf', days: 63, version: 'v20261003.1', clients: ['hk-main', 'home-lab'], stale: [], issued: dateIn(-27) },
  { id: 'cert-3', domain: '*.example.org', root: 'example.org', provider: 'ali', days: 18, version: 'v20260818.1', clients: ['ali-compute'], stale: [], issued: dateIn(-72) },
  { id: 'cert-4', domain: '*.example.dev', root: 'example.dev', provider: 'ali', days: 82, version: 'v20261022.1', clients: ['ali-web-01', 'ali-web-02'], stale: [], issued: dateIn(-8) },
  { id: 'cert-5', domain: '*.example.cn', root: 'example.cn', provider: 'ali', days: 54, version: 'v20260923.1', clients: ['home-lab', 'dell-ubuntu'], stale: ['dell-ubuntu'], issued: dateIn(-36) },
];
const credentials = [
  { id: 'dns-cf-main', name: 'Cloudflare 主账户', provider: 'cf', suffix: 'a93e', note: '香港入口与个人域名', updated: '示例记录' },
  { id: 'dns-ali-main', name: '阿里云域名账户', provider: 'ali', suffix: '72c1', note: '阿里云托管域名', updated: '示例记录' },
];
certificates.forEach((cert) => { cert.credentialId = cert.provider === 'cf' ? 'dns-cf-main' : 'dns-ali-main'; });
const events = [
  { type: 'deploy', title: '<strong>hk-main</strong> 已加载最新证书', detail: '*.example.com · 配置检查、重载与指纹验证完成', time: '2 分钟前' },
  { type: 'renew', title: '<strong>*.example.dev</strong> 续期完成', detail: '阿里云 DNS · 新版本已分发至 2 台客户端', time: '35 分钟前' },
  { type: 'warning', title: '<strong>dell-ubuntu</strong> 暂未同步最新版本', detail: '*.example.cn · 客户端离线，恢复连接后自动重试', time: '2 小时前' },
  { type: 'deploy', title: '<strong>home-lab</strong> 证书检查完成', detail: '*.example.net · 当前已是最新版本，无需重载', time: '3 小时前' },
  { type: 'renew', title: '<strong>*.example.com</strong> DNS 授权检查通过', detail: 'Cloudflare · DNS 凭据仅保存在证书中心', time: '昨天 02:00' },
];
const defaultSettings = { interval: '60', renewal: '30', autoDeploy: true, rollback: true, publicUrl: 'https://certs.example.com' };
let settings;
try { settings = { ...defaultSettings, ...JSON.parse(localStorage.getItem('certrelay-ui-settings') || '{}') }; } catch { settings = { ...defaultSettings }; }
try { settings.publicUrl = normalizeServerUrl(settings.publicUrl); } catch { settings.publicUrl = defaultSettings.publicUrl; }
const validPages = ['overview', 'certificates', 'credentials', 'clients', 'activity', 'settings'];
const state = { page: 'overview', query: '', provider: 'all', clientFilter: 'all', logFilter: 'all', menu: false };
const app = document.querySelector('#app');
const overlayRoot = document.querySelector('#overlay-root');
let overlayFocus;
let toastTimer;
let enrollmentTimer;
const providerName = (provider) => provider === 'cf' ? 'Cloudflare' : '阿里云 DNS';
const pendingCount = () => certificates.reduce((sum, cert) => sum + cert.stale.length, 0);
const onlineClients = () => clientSeed.filter((client) => client.online);
const certById = (id) => certificates.find((cert) => cert.id === id);
const clientById = (id) => clientSeed.find((client) => client.id === id);
const credentialById = (id) => credentials.find((credential) => credential.id === id);
const credentialReferences = (id) => certificates.filter((cert) => cert.credentialId === id);
function normalizeServerUrl(value) {
  let url;
  try { url = new URL(String(value).trim()); } catch { throw new Error('请输入有效的 HTTPS 服务地址。'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('服务地址须为 HTTPS，仅包含域名与可选端口，不含账号、路径或参数。');
  }
  return url.origin;
}
function randomHex(length) {
  return [...crypto.getRandomValues(new Uint8Array(length))].map((value) => value.toString(16).padStart(2, '0')).join('');
}
const badge = (text, kind = '', dot = true) => `<span class="badge ${kind}">${dot ? '<i class="dot"></i>' : ''}${escape(text)}</span>`;
const button = (action, label, symbol = '', kind = 'secondary', extra = '') => `<button type="button" class="btn btn-${kind}" data-action="${action}" ${extra}>${symbol ? icon(symbol) : ''}${escape(label)}</button>`;

function layout() {
  const pageNames = { overview: '总览', certificates: '域名证书', credentials: 'DNS 凭据', clients: '客户端', activity: '分发记录', settings: '设置' };
  const nav = [ ['overview', 'grid', '总览'], ['certificates', 'certificate', '域名证书'], ['credentials', 'key', 'DNS 凭据'], ['clients', 'server', '客户端'], ['activity', 'activity', '分发记录'] ];
  app.innerHTML = `
    <div class="nav-scrim ${state.menu ? 'open' : ''}" data-action="toggle-menu"></div>
    <aside class="sidebar ${state.menu ? 'open' : ''}" aria-label="主导航">
      <a class="brand" href="#overview" aria-label="CertRelay 首页"><span class="brand-mark">${icon('shield')}</span><span><span class="brand-name">CertRelay<span style="color:#80ad8a">.</span></span><span class="brand-caption" style="display:block">YOUR CERTIFICATE HOME</span></span></a>
      <div class="workspace"><span class="workspace-icon">${icon('cloud')}</span><span><strong>个人工作空间</strong><small>Personal workspace</small></span>${icon('down')}</div>
      <div class="nav-label">工作空间</div>
      <nav>${nav.map(([page, symbol, label]) => `<a href="#${page}" class="nav-item ${state.page === page ? 'active' : ''}" ${state.page === page ? 'aria-current="page"' : ''}>${icon(symbol)}<span>${label}</span>${page === 'certificates' ? `<span class="nav-count">${certificates.length}</span>` : ''}</a>`).join('')}
      <div class="nav-separator"></div><a href="#settings" class="nav-item ${state.page === 'settings' ? 'active' : ''}" ${state.page === 'settings' ? 'aria-current="page"' : ''}>${icon('settings')}<span>设置</span></a></nav>
      <div class="sidebar-footer"><div class="local-card"><div class="local-status"><i class="dot"></i> 私有部署，自在掌控</div><p>密钥留在中心<br>证书送到需要的地方</p></div><div class="sidebar-bottom"><button type="button" class="btn-text" data-action="help" style="font-size:10px;color:inherit">${icon('book')} 使用指南</button><span class="version">v0.1.0</span></div></div>
    </aside>
    <div class="main"><header class="topbar"><button type="button" class="icon-button menu-button" data-action="toggle-menu" aria-label="打开导航" aria-expanded="${state.menu}">${icon('menu')}</button><div class="breadcrumb"><span class="breadcrumb-home">工作空间</span>${icon('chevron')}<strong>${pageNames[state.page]}</strong></div><div class="topbar-right"><button type="button" class="search-trigger" data-action="search" aria-label="搜索证书或客户端">${icon('search')}<span class="search-text">搜索证书或客户端</span><kbd class="kbd">Ctrl K</kbd></button><span class="topbar-divider"></span><span class="preview-badge">演示数据</span><button type="button" class="icon-button" data-action="alerts" aria-label="查看待处理项目">${icon('bell')}</button><span class="avatar" title="个人工作空间">ME</span></div></header>
    <main class="content" id="main-content">${renderPage()}</main></div>`;
}

function heading(title, description, actions = '') {
  return `<div class="eyebrow">CERTIFICATES, SIMPLIFIED.</div><div class="page-heading"><div><h1>${title}<span class="heading-dot">.</span></h1><p class="page-description">${description}</p></div><div class="heading-actions">${actions}</div></div>`;
}
function pageFooter() {
  return `<footer class="page-footer"><span>${icon('lock')} 你的证书，你的服务器，你的掌控。</span><span>轻一点，安心一点。<span style="margin-left:12px">CERTRELAY © ${now.getFullYear()}</span></span></footer>`;
}
function renderPage() {
  if (state.page === 'certificates') return renderCertificates();
  if (state.page === 'credentials') return renderCredentials();
  if (state.page === 'clients') return renderClients();
  if (state.page === 'activity') return renderActivity();
  if (state.page === 'settings') return renderSettings();
  return renderOverview();
}
function metric(label, value, unit, symbol, foot, footKind, spark) {
  return `<section class="metric"><div class="metric-label">${label}<span class="metric-icon">${icon(symbol)}</span></div><div class="metric-value">${value}<small>${unit}</small></div><div class="metric-foot ${footKind || ''}">${icon(footKind === 'warning' ? 'clock' : 'checkCircle')}${foot}</div>${spark ? `<div class="metric-spark"><svg viewBox="0 0 70 30" aria-hidden="true"><defs><linearGradient id="spark-${symbol}" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#daeacf" stop-opacity=".65"/><stop offset="1" stop-color="#daeacf" stop-opacity="0"/></linearGradient></defs><path d="M1 26 10 23 18 25 27 17 36 19 45 10 54 13 63 5 69 7V30H1Z" fill="url(#spark-${symbol})"/><path d="m1 26 9-3 8 2 9-8 9 2 9-9 9 3 9-8 6 2" fill="none" stroke="#b5cda2" stroke-width="1.5"/></svg></div>` : ''}</section>`;
}
function renderOverview() {
  const deployed = certificates.reduce((sum, cert) => sum + cert.clients.length - cert.stale.length, 0);
  const assignments = certificates.reduce((sum, cert) => sum + cert.clients.length, 0);
  return `${heading('证书分发，一目了然', '从签发到每一次更新，让你的域名一直安心在线。', button('check-all', '检查更新', 'refresh') + button('add-certificate', '添加证书', 'plus', 'primary'))}
    <div class="metrics">
      ${metric('管理中的证书', certificates.length, '张', 'certificate', `${certificates.filter((cert) => !cert.pending).length} 张通配符证书`, 'success', true)}
      ${metric('在线客户端', onlineClients().length, `/ ${clientSeed.length} 台`, 'server', `${clientSeed.filter((client) => !client.online).length} 台离线，等待重新连接`, '', true)}
      ${metric('已同步的分发', deployed, `/ ${assignments}`, 'shield', pendingCount() ? `${pendingCount()} 项等待客户端同步` : '所有目标已同步', pendingCount() ? 'warning' : 'success', true)}
      ${metric('即将到期', certificates.filter((cert) => !cert.pending && cert.days <= Number(settings.renewal)).length, '张', 'clock', `提前 ${settings.renewal} 天自动申请续期`, 'warning', false)}
    </div>
    <div class="overview-grid"><div><section class="panel"><div class="panel-heading"><div><h2 class="panel-title">域名证书 <span class="count-chip">${certificates.length}</span></h2><p class="panel-subtitle">每一个域名，都有妥善的照顾</p></div><a href="#certificates" class="btn btn-text" style="font-size:10px">查看全部 ${icon('arrow')}</a></div><div class="table-wrap">${certificateTable(certificates, true)}</div><div class="panel-footer"><span class="footer-info">${icon('refresh')} 自动检查 · 每 ${settings.interval === '60' ? '1 小时' : `${settings.interval} 分钟`}</span><span>DNS 凭据仅保存在中心</span></div></section>
      <section class="panel activity-panel"><div class="panel-heading"><h2 class="panel-title">最近动态</h2><a class="btn btn-text" href="#activity" style="font-size:10px">所有记录 ${icon('arrow')}</a></div><div class="activity-list">${renderEvents(events.slice(0, 3))}</div></section></div>
    <aside class="right-stack"><section class="panel network-panel"><div class="panel-heading"><h2 class="panel-title">从中心，到每一台</h2>${badge('主动拉取', 'neutral', false)}</div><div class="network-viz"><svg class="network-lines" viewBox="0 0 260 173" preserveAspectRatio="none" aria-hidden="true"><path d="M130 59V91M130 91H41Q36 91 36 97V117M130 91v26M130 91h89q5 0 5 6v20" fill="none" stroke="currentColor" stroke-width="1.3" stroke-dasharray="3 4"/><circle cx="130" cy="91" r="3" fill="#a9c197"/></svg><div class="hub">${icon('shield')}</div><span class="hub-label">香港 · 证书中心</span><span class="network-node">${icon('server')}</span><span class="network-node">${icon('server')}</span><span class="network-node offline">${icon('server')}</span><span class="node-caption one">云服务器</span><span class="node-caption two">本地设备</span><span class="node-caption three">离线设备</span></div><div class="network-stats"><div class="network-stat"><strong>${clientSeed.length}</strong><span>已登记</span></div><div class="network-stat"><strong>${onlineClients().length}</strong><span>在线</span></div><div class="network-stat offline"><strong>${clientSeed.filter((client) => !client.online).length}</strong><span>离线</span></div></div><div class="network-bottom"><span><i class="dot"></i> 只分发已授权的证书</span><a href="#clients" class="btn-text">管理 ${icon('arrow')}</a></div></section>
      ${attentionCard()}
      <section class="automation-card"><div class="eyebrow">LESS MAINTENANCE. MORE PEACE.</div><h3>续期这件事，交给它。</h3><p>集中申请，按需分发。<br>让每台小服务器都轻装上阵。</p><div class="automation-icon">${icon('leaf')}</div></section>
    </aside></div>${pageFooter()}`;
}
function attentionCard() {
  const pending = certificates.find((cert) => cert.stale.length);
  if (!pending) return `<section class="attention-panel panel"><div class="attention-heading">${icon('checkCircle')} 一切都已就绪</div><p>所有证书已分发完成，没有需要处理的更新。</p></section>`;
  const client = clientById(pending.stale[0]);
  return `<section class="attention-panel panel"><div class="attention-heading">${icon('clock')} 还有 ${pendingCount()} 项等待同步</div><p><span class="mono">${escape(client?.name || pending.stale[0])}</span> 暂时离线。<br>现有证书继续使用，连接恢复后再更新。</p><button type="button" class="btn btn-text" data-action="certificate-detail" data-id="${pending.id}">查看分发状态 ${icon('arrow')}</button></section>`;
}
function certificateTable(list, compact = false) {
  if (!list.length) return emptyState('没有找到匹配的证书', '试试其他域名，或调整筛选条件。');
  return `<table class="cert-table ${compact ? 'overview-cert-table' : ''}"><caption class="sr-only">域名证书与分发状态</caption><thead><tr><th scope="col">域名 / DNS 托管</th><th scope="col" class="status-column">状态</th><th scope="col">剩余有效期</th><th scope="col">${compact ? '分发' : '分发客户端'}</th>${compact ? '' : '<th scope="col">当前版本</th>'}<th scope="col"><span class="sr-only">操作</span></th></tr></thead><tbody>${list.map((cert) => `<tr><td><div class="domain-cell"><span class="domain-icon">${icon('globe')}</span><div><button type="button" class="domain-name" data-action="certificate-detail" data-id="${cert.id}" style="padding:0">${escape(cert.domain)}</button><div class="domain-meta"><i class="provider-dot ${cert.provider}"></i>${providerName(cert.provider)}<span style="color:#d0d8c9">/</span> ECC P-256</div></div></div></td><td class="status-column">${cert.pending ? badge('待签发', 'neutral') : cert.days <= Number(settings.renewal) ? badge('即将续期', 'warning') : badge('正常')}</td><td><div class="expires ${cert.days <= Number(settings.renewal) ? 'warning' : ''}"><div class="days">${cert.pending ? '—' : cert.days}<small>${cert.pending ? '' : '天'}</small></div><div class="expiry-bar"><i style="width:${Math.max(0, Math.min(100, cert.days / 90 * 100))}%"></i></div></div></td><td><div class="deploy-count ${cert.stale.length ? 'warning' : ''}">${icon(cert.stale.length ? 'clock' : 'checkCircle')} ${cert.clients.length - cert.stale.length}<span class="muted">/ ${cert.clients.length} 台</span></div></td>${compact ? '' : `<td class="mono muted" style="font-size:10px">${escape(cert.version)}</td>`}<td><button type="button" class="icon-button" data-action="certificate-detail" data-id="${cert.id}" aria-label="查看 ${escape(cert.domain)} 详情">${icon('more')}</button></td></tr>`).join('')}</tbody></table>`;
}
function renderCertificates() {
  return `<div class="certificates-page">${heading('每个域名，都有归处', '集中管理你的通配符证书，续期与分发各有章法。', button('add-certificate', '添加证书', 'plus', 'primary'))}
    <div class="toolbar"><label class="input-search">${icon('search')}<input id="certificate-search" type="search" placeholder="搜索域名…" aria-label="搜索域名" value="${escape(state.query)}"></label><div class="segmented" aria-label="按 DNS 托管筛选">${[['all', '全部证书'], ['cf', 'Cloudflare'], ['ali', '阿里云 DNS']].map(([value, label]) => `<button type="button" data-action="provider-filter" data-value="${value}" class="${state.provider === value ? 'active' : ''}" aria-pressed="${state.provider === value}">${label}</button>`).join('')}</div></div>
    <section class="panel"><div id="certificate-list" class="table-wrap">${certificateTable(filteredCertificates())}</div><div class="panel-footer"><span>根域名与通配符一起管理</span><span>HTTPS 加密分发 · 客户端独立授权</span></div></section></div>${pageFooter()}`;
}
function filteredCertificates() {
  return certificates.filter((cert) => (state.provider === 'all' || cert.provider === state.provider) && cert.domain.toLowerCase().includes(state.query.toLowerCase()));
}
function renderClients() {
  const list = clientSeed.filter((client) => state.clientFilter === 'all' || (state.clientFilter === 'online' ? client.online : !client.online));
  return `${heading('证书，送到需要的地方', '只为真正提供 HTTPS 的设备分发证书，让小设备保持轻盈。', button('add-client', '登记客户端', 'plus', 'primary'))}<div class="policy-summary">${icon('shield')}<span><strong>最小授权，按需领取。</strong> 每台客户端只能获取你允许的证书，无法访问 DNS 密钥。</span></div><div class="toolbar"><div class="segmented" aria-label="客户端状态筛选">${[['all', `全部 ${clientSeed.length}`], ['online', `在线 ${onlineClients().length}`], ['offline', `离线 ${clientSeed.filter((client) => !client.online).length}`]].map(([value, label]) => `<button type="button" data-action="client-filter" data-value="${value}" class="${state.clientFilter === value ? 'active' : ''}" aria-pressed="${state.clientFilter === value}">${label}</button>`).join('')}</div><span class="muted tiny">定时运行 · 无需一直驻留内存</span></div><div class="client-grid">${list.length ? list.map(clientCard).join('') : emptyState('没有此状态的客户端', '登记客户端后，它们会出现在这里。')}</div>${pageFooter()}`;
}
function clientCard(client) {
  const assigned = certificates.filter((cert) => cert.clients.includes(client.id));
  const pending = assigned.filter((cert) => cert.stale.includes(client.id)).length;
  return `<section class="panel client-card"><div class="client-card-top"><span class="client-server-icon">${icon(client.arch.startsWith('arm') ? 'cpu' : 'server')}</span>${badge(client.waiting ? '待登记' : client.online ? '在线' : '离线', client.online ? '' : 'neutral')}</div><h3>${escape(client.name)}</h3><p class="client-host">${escape(client.label)}<span style="margin:0 7px;color:#d4ddcd">/</span>${escape(client.memory)}</p><dl class="client-meta"><div><dt>已授权证书</dt><dd>${assigned.length} 张 ${pending ? `<span style="color:#baa06f;font-size:9px">· ${pending} 项待更新</span>` : ''}</dd></div><div><dt>服务</dt><dd>${escape(client.service)}</dd></div><div><dt>系统架构</dt><dd>Linux / ${escape(client.arch)}</dd></div><div><dt>最近检查</dt><dd>${escape(client.seen)}</dd></div></dl><div class="client-card-footer"><span>${escape(client.location)}</span><button type="button" class="btn btn-text" data-action="client-detail" data-id="${client.id}">管理授权 ${icon('arrow')}</button></div></section>`;
}
function renderEvents(list) {
  return list.map((event) => `<div class="activity-item"><span class="activity-symbol ${event.type === 'warning' ? 'warning' : ''}">${icon(event.type === 'warning' ? 'clock' : event.type === 'renew' ? 'refresh' : 'check')}</span><div class="activity-main"><p>${event.title}</p><small>${escape(event.detail)}</small></div><time class="activity-time">${escape(event.time)}</time></div>`).join('');
}
function renderActivity() {
  const list = events.filter((event) => state.logFilter === 'all' || event.type === state.logFilter);
  return `${heading('每次更新，都有迹可循', '从申请、发布到实际加载，重要的变化留在这里。')}<div class="toolbar"><div class="history-filter" aria-label="记录类型筛选">${[['all', '全部记录'], ['deploy', '证书分发'], ['renew', '签发与续期'], ['warning', '需要关注']].map(([value, label]) => `<button type="button" data-action="log-filter" data-value="${value}" class="${state.logFilter === value ? 'active' : ''}" aria-pressed="${state.logFilter === value}">${label}</button>`).join('')}</div><span class="muted tiny">${list.length} 条记录</span></div><section class="panel history-panel"><div class="history-date">最近动态 <span class="muted" style="font-size:9px;margin-left:8px">示例时间线</span></div><div class="activity-list">${list.length ? renderEvents(list) : emptyState('暂无此类记录', '后续的更新会显示在这里。')}</div></section>${pageFooter()}`;
}
function renderSettings() {
  return `${heading('刚刚好的自动化', '少一点需要操心的设置，多一点持续在线的安心。')}
    <form id="settings-form"><div class="settings-grid"><section class="panel settings-panel">
      <div class="settings-section"><h3>中心访问地址</h3><p>用于生成登记链接。客户端通过你提供的链接找到中心，不预置服务器地址。</p>
        <label class="field public-url-field"><span>对外 HTTPS 地址</span><input name="publicUrl" id="public-url" type="url" value="${escape(settings.publicUrl)}" required placeholder="https://certs.your-domain.com"><small>部署时填写中心的真实地址。当前 example.com 地址仅用于演示；改地址不会自动迁移已登记客户端。</small></label>
      </div>
      <div class="settings-section"><h3>续期与分发</h3><p>中心负责申请，客户端主动领取。彼此独立，各自轻盈。</p>
        <div class="settings-row"><div><label for="renewal-days">提前续期</label><small>按证书实际到期时间计算，不依赖固定有效期。</small></div><select id="renewal-days" class="settings-select" name="renewal">${['15', '30', '45'].map((value) => `<option value="${value}" ${settings.renewal === value ? 'selected' : ''}>提前 ${value} 天</option>`).join('')}</select></div>
        <div class="settings-row"><div><label for="check-interval">客户端检查间隔</label><small>有新版本才下载，检查完成后进程退出。</small></div><select id="check-interval" class="settings-select" name="interval">${[['15', '15 分钟'], ['30', '30 分钟'], ['60', '1 小时'], ['360', '6 小时']].map(([value, label]) => `<option value="${value}" ${settings.interval === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div>
        <div class="settings-row"><div><label for="auto-deploy">续期后自动发布</label><small>新证书校验通过后，允许已授权客户端获取。</small></div><input id="auto-deploy" class="toggle" type="checkbox" name="autoDeploy" role="switch" ${settings.autoDeploy ? 'checked' : ''}></div>
      </div>
      <div class="settings-section"><h3>安装保护</h3><div class="settings-row"><div><label for="rollback">安装失败时自动回退</label><small>配置检查或加载验证失败，恢复上一份可用证书。</small></div><input id="rollback" class="toggle" type="checkbox" name="rollback" role="switch" ${settings.rollback ? 'checked' : ''}></div></div>
      <div class="settings-section"><h3>DNS 凭据</h3><p>独立管理 Cloudflare 与阿里云账户，在添加证书时选择使用哪份凭据。</p><a href="#credentials" class="btn btn-secondary" style="margin-top:15px">${icon('key')} 管理 DNS 凭据 ${icon('arrow')}</a></div>
    </section><aside><div class="settings-note"><h3>${icon('leaf')} 轻量，是一种选择</h3>五个域名，也值得被认真照顾。<br><br>集中签发，按需分发。<br>不需要给每台设备重复配置 DNS 密钥，也不必让小设备承担申请续期的工作。<br><br><span style="font-size:10px;color:#a4b197">当前为交互预览；这里的设置仅保存在本浏览器，尚未连接真实证书服务。</span></div></aside></div>
    <div id="settings-error" class="field-error" role="alert"></div><div class="settings-buttons"><button type="submit" class="btn btn-primary">${icon('check')} 保存设置</button></div></form>${pageFooter()}`;
}
function renderCredentials() {
  return `${heading('密钥归中心，权限有边界', '在这里管理 DNS 账户，添加证书时选择对应凭据。', button('add-credential', '添加 DNS 凭据', 'plus', 'primary'))}
    <div class="policy-summary">${icon('lock')}<span>当前是交互预览，只管理示例名称和关联关系。<strong>密钥输入暂未开放，请勿填写真实密钥。</strong></span></div>
    <div class="credential-grid">${credentials.map((credential) => {
      const references = credentialReferences(credential.id);
      return `<section class="panel credential-card"><div class="client-card-top"><span class="credential-provider ${credential.provider}">${icon('cloud')}</span>${badge('示例 · 未验证', 'neutral', false)}</div>
        <h2>${escape(credential.name)}</h2><p class="credential-subtitle">${providerName(credential.provider)} · ${credential.provider === 'cf' ? 'API Token' : 'RAM AccessKey'}</p>
        <div class="credential-mask mono">DEMO · •••• ${escape(credential.suffix)}</div>
        <dl class="client-meta"><div><dt>关联域名</dt><dd>${references.length} 个</dd></div><div><dt>最近修改</dt><dd>${escape(credential.updated)}</dd></div></dl>
        <p class="credential-note">${escape(credential.note || '还没有备注')}</p>
        <div class="credential-card-footer">${button('edit-credential', '查看与编辑', 'settings', 'secondary', `data-id="${credential.id}"`)}${button('inspect-credential', '检测权限', 'shield', 'text', `data-id="${credential.id}"`)}</div></section>`;
    }).join('') || emptyState('还没有 DNS 凭据', '先添加一份凭据，再为域名选择它。')}</div>
    <section class="panel credential-principles"><div>${icon('key')}<h3>每个账户一份凭据</h3><p>一个平台可以添加多个账户，多张证书也可以复用同一份凭据。</p></div><div>${icon('server')}<h3>只留在主服务器</h3><p>正式版在服务端保护密钥；业务客户端只领取已授权的网站证书。</p></div><div>${icon('shield')}<h3>云端吊销单独处理</h3><p>删除这里的记录不会吊销云平台密钥，吊销仍需在云控制台完成。</p></div></section>${pageFooter()}`;
}
function openCredential(id) {
  const credential = id ? credentialById(id) : null;
  if (id && !credential) return;
  const provider = credential?.provider || 'cf';
  openOverlay(`${modalHeader(credential ? '管理 DNS 凭据' : '添加 DNS 凭据', '先整理账户与域名的关系，真实密钥留待后端接入。')}
    <form id="credential-form" data-id="${credential?.id || ''}"><div class="modal-body">
      <label class="field"><span>凭据名称</span><input name="name" value="${escape(credential?.name || '')}" placeholder="例如 Cloudflare 个人账户" maxlength="60" required autofocus></label>
      <label class="field"><span>DNS 平台</span><select name="provider" id="credential-provider" ${credential ? 'disabled' : ''}><option value="cf" ${provider === 'cf' ? 'selected' : ''}>Cloudflare</option><option value="ali" ${provider === 'ali' ? 'selected' : ''}>阿里云 DNS</option></select></label>
      <div id="credential-secret-fields">${credentialSecretFields(provider)}</div>
      <label class="field"><span>备注</span><input name="note" value="${escape(credential?.note || '')}" maxlength="120" placeholder="例如个人域名专用"></label>
      ${credential ? `<div class="credential-associations"><span>关联的域名</span><p>${credentialReferences(credential.id).map((cert) => escape(cert.domain)).join('、') || '暂无关联，可以删除此示例记录'}</p></div>` : ''}
      <div class="form-note">${icon('info')}<span>预览中只保存名称、平台和备注，不接收或保存真实密钥。正式版的新增、替换将经 HTTPS 提交给主服务器。</span></div><div id="form-error" class="field-error" role="alert"></div>
    </div><div class="modal-footer credential-modal-footer">${credential ? button('delete-credential', '删除记录', '', 'danger', `data-id="${credential.id}"`) : ''}${button('close-overlay', '取消')}<button type="submit" class="btn btn-primary">${icon('check')} ${credential ? '保存示例信息' : '添加示例凭据'}</button></div></form>`, 'modal', credential ? '编辑 DNS 凭据' : '添加 DNS 凭据');
}
function credentialSecretFields(provider) {
  const fields = provider === 'cf' ? ['API Token', 'Account ID / Zone ID（按授权范围配置）'] : ['AccessKey ID', 'AccessKey Secret'];
  return `<div class="secret-fields">${fields.map((field) => `<label class="field"><span>${field}</span><input type="password" disabled autocomplete="off" placeholder="后端接入后开放填写" aria-label="${field}"></label>`).join('')}<p>当前不接收真实密钥</p></div>`;
}
function openDeleteCredential(id) {
  const credential = credentialById(id);
  if (!credential) return;
  const references = credentialReferences(id);
  openOverlay(`${modalHeader(references.length ? '这份凭据仍在使用' : '删除示例凭据', credential.name)}<div class="modal-body"><p class="demo-note">${references.length ? `还有 ${references.length} 个域名关联此凭据：${references.map((cert) => escape(cert.domain)).join('、')}。请先调整关联，再删除。` : '只删除当前预览中的示例记录，不会吊销 Cloudflare 或阿里云的密钥。'}</p></div><div class="modal-footer">${button('close-overlay', references.length ? '知道了' : '取消')}${references.length ? '' : button('confirm-delete-credential', '删除示例记录', '', 'danger', `data-id="${id}"`)}</div>`, 'modal', '删除 DNS 凭据');
}
function emptyState(title, text) { return `<div class="empty-state">${icon('search')}<h3>${escape(title)}</h3><p>${escape(text)}</p></div>`; }

function openOverlay(content, type = 'modal', title = '对话框') {
  clearInterval(enrollmentTimer);
  if (!overlayRoot.children.length) overlayFocus = document.activeElement;
  overlayRoot.innerHTML = `<div class="overlay-backdrop" data-action="close-overlay"></div><section class="${type}" role="dialog" aria-modal="true" aria-label="${escape(title)}" tabindex="-1">${content}</section>`;
  document.body.style.overflow = 'hidden';
  app.inert = true;
  requestAnimationFrame(() => {
    const focusTarget = overlayRoot.querySelector('[autofocus]') || overlayRoot.querySelector('input,select,button') || overlayRoot.querySelector('[role="dialog"]');
    focusTarget?.focus();
  });
}
function closeOverlay() {
  clearInterval(enrollmentTimer);
  overlayRoot.innerHTML = '';
  document.body.style.overflow = '';
  app.inert = false;
  if (overlayFocus?.isConnected) overlayFocus.focus();
}
function modalHeader(title, description) {
  return `<div class="modal-header"><div><h2>${escape(title)}</h2><p>${escape(description)}</p></div><button type="button" class="icon-button" data-action="close-overlay" aria-label="关闭">${icon('close')}</button></div>`;
}
function toast(message) {
  clearTimeout(toastTimer);
  document.querySelector('#toast-root').innerHTML = `<div class="toast">${icon('checkCircle')}<span>${escape(message)}</span></div>`;
  toastTimer = setTimeout(() => { document.querySelector('#toast-root').innerHTML = ''; }, 4200);
}
function openCertificate(id) {
  const cert = certById(id);
  if (!cert) return;
  openOverlay(`${modalHeader('证书详情', '签发与分发，分别确认，各有记录。')}<div class="drawer-content"><div class="detail-domain"><div class="domain-name mono">${escape(cert.domain)}</div><div class="domain-meta"><i class="provider-dot ${cert.provider}"></i>${providerName(cert.provider)}<span style="margin-left:auto">${cert.pending ? badge('待签发', 'neutral') : badge(cert.days <= Number(settings.renewal) ? '即将续期' : '正常', cert.days <= Number(settings.renewal) ? 'warning' : '')}</span></div></div><section class="detail-section"><h3>证书信息</h3><dl class="detail-list"><div><dt>覆盖域名</dt><dd>${escape(cert.root)}<br>${escape(cert.domain)}</dd></div><div><dt>签发机构</dt><dd>${cert.pending ? '待签发' : "Let’s Encrypt（示例）"}</dd></div><div><dt>密钥算法</dt><dd>ECC P-256</dd></div><div><dt>签发日期</dt><dd>${cert.pending ? '—' : escape(cert.issued)}</dd></div><div><dt>到期日期</dt><dd>${cert.pending ? '—' : dateIn(cert.days)} ${cert.pending ? '' : `· 剩余 ${cert.days} 天`}</dd></div><div><dt>当前版本</dt><dd class="mono">${escape(cert.version)}</dd></div></dl></section><section class="detail-section"><h3>分发目标 <span class="count-chip">${cert.clients.length}</span></h3>${cert.clients.length ? cert.clients.map((clientId) => { const client = clientById(clientId); return `<div class="detail-client">${icon('server')}<div>${escape(client?.name || clientId)}<small>${cert.stale.includes(clientId) ? '恢复连接后自动拉取' : '已安装 · 已加载验证'}</small></div>${badge(cert.stale.includes(clientId) ? '等待同步' : '已同步', cert.stale.includes(clientId) ? 'warning' : '')}</div>`; }).join('') : '<p class="muted tiny">尚未授权客户端，请到客户端页面分配。</p>'}</section><p class="demo-note">${icon('info')} 示例证书，仅用于预览管理与分发流程。</p></div><div class="modal-footer">${button('renew-certificate', cert.pending ? '申请证书' : '立即续期', 'refresh', 'secondary', `data-id="${cert.id}"`)}${button('distribute', '重新分发', 'arrow', 'primary', `data-id="${cert.id}" ${cert.pending || !cert.clients.length ? 'disabled' : ''}`)}</div>`, 'drawer', `${cert.domain} 证书详情`);
  const credentialRow = document.createElement('div');
  credentialRow.innerHTML = `<dt>DNS 凭据</dt><dd>${escape(credentialById(cert.credentialId)?.name || '未关联')}</dd>`;
  overlayRoot.querySelector('.detail-list').append(credentialRow);
}
function openAddCertificate() {
  openOverlay(`${modalHeader('让新域名安心在线', '添加根域名，自动包含一级通配符。')}<form id="certificate-form"><div class="modal-body"><label class="field"><span>根域名</span><input name="domain" placeholder="your-domain.com" required maxlength="253" autocomplete="off" autofocus><small>例如 example.com，将一起管理 example.com 和 *.example.com。</small></label><label class="field"><span>DNS 托管平台</span><select name="provider" id="certificate-provider"><option value="cf">Cloudflare</option><option value="ali">阿里云 DNS</option></select><small>按域名实际的 DNS 托管平台选择。</small></label><label class="field"><span>使用的 DNS 凭据</span><select name="credentialId" id="certificate-credential" required>${credentialOptions('cf')}</select><small>在「DNS 凭据」页面管理账户，同一平台可以有多份凭据。</small></label><div class="form-note">${icon('info')}<span>当前为界面预览。添加后生成一条待签发的示例记录，不会操作 DNS 或申请真实证书。</span></div><div id="form-error" class="field-error" role="alert"></div></div><div class="modal-footer">${button('close-overlay', '取消')}<button type="submit" class="btn btn-primary">${icon('plus')} 添加域名</button></div></form>`, 'modal', '添加证书');
}
function credentialOptions(provider) {
  const list = credentials.filter((credential) => credential.provider === provider);
  return list.length ? list.map((credential) => `<option value="${credential.id}">${escape(credential.name)}</option>`).join('') : '<option value="">请先添加此平台的 DNS 凭据</option>';
}
function openClient(id) {
  const client = clientById(id);
  if (!client) return;
  openOverlay(`${modalHeader(client.name, `${client.label} · 管理此客户端可以领取的证书`)}<form id="authorization-form" data-id="${client.id}"><div class="modal-body"><div class="detail-list"><div><dt>客户端状态</dt><dd>${badge(client.waiting ? '待登记' : client.online ? '在线' : '离线', client.online ? '' : 'neutral')}</dd></div><div><dt>最近检查</dt><dd>${escape(client.seen)}</dd></div><div><dt>部署服务</dt><dd>${escape(client.service)}</dd></div></div><label class="field" style="margin-top:25px"><span>允许领取的证书</span></label><div class="scope-options">${certificates.map((cert) => `<label class="scope-option"><input type="checkbox" name="certificates" value="${cert.id}" ${cert.clients.includes(client.id) ? 'checked' : ''}>${escape(cert.domain)}<span>${providerName(cert.provider)}</span></label>`).join('')}</div><p class="demo-note">取消授权会阻止后续领取；已安装的证书不会从设备上删除。当前变更仅用于本次界面演示。</p></div><div class="modal-footer">${button('close-overlay', '取消')}<button type="submit" class="btn btn-primary">${icon('check')} 保存授权</button></div></form>`, 'modal', `${client.name} 的证书授权`);
  if (client.waiting) {
    const invitationSection = document.createElement('div');
    invitationSection.className = 'pending-enrollment';
    invitationSection.innerHTML = `<p>尚未与真实设备建立联系</p>${button('view-enrollment', '查看登记邀请', 'key', 'secondary', `data-id="${client.id}"`)}<small>成功登记前不会显示为在线。</small>`;
    overlayRoot.querySelector('.modal-body').prepend(invitationSection);
  }
}
function openAddClient() {
  openOverlay(`${modalHeader('欢迎一台新设备', '生成链接与验证码，在目标机器的 CLI 中完成登记。')}<form id="client-form"><div class="modal-body"><label class="field"><span>客户端名称</span><input name="name" placeholder="例如 arm-lab-01" pattern="[a-zA-Z0-9][a-zA-Z0-9_-]{1,47}" required maxlength="48" autofocus><small>2–48 位，字母、数字、短横线或下划线。</small></label><label class="field"><span>备注名称</span><input name="label" placeholder="例如书房 ARM 小主机" maxlength="60"></label><label class="field"><span>系统架构</span><select name="arch"><option value="amd64">Linux / amd64</option><option value="arm64">Linux / arm64</option><option value="armv7">Linux / ARMv7（待兼容性验证）</option></select></label><div class="form-note">${icon('info')}<span>客户端无需预置中心地址。当前仅演示邀请，链接与验证码不会连接真实客户端。</span></div><div id="form-error" class="field-error" role="alert"></div></div><div class="modal-footer">${button('close-overlay', '取消')}<button type="submit" class="btn btn-primary">生成登记链接 ${icon('arrow')}</button></div></form>`, 'modal', '登记客户端');
}
function showEnrollment(client) {
  if (!client.waiting) return toast('这台示例客户端已登记，无需生成新邀请');
  const time = Date.now();
  if (!client.enrollment) {
    // These values are UI fixtures, never accepted by a real registration API.
    const digits = [...crypto.getRandomValues(new Uint8Array(8))].map((value) => value % 10).join('');
    client.enrollment = { id: `DEMO-${randomHex(16)}`, code: digits, expiresAt: time + 10 * 60000, origin: settings.publicUrl, status: 'pending' };
  }
  const invitation = client.enrollment;
  const link = `${invitation.origin}/enroll/${invitation.id}`;
  const code = `${invitation.code.slice(0, 4)} ${invitation.code.slice(4)}`;
  openOverlay(`${modalHeader('登记邀请已就绪', `${client.name} · 将链接与验证码带到目标机器`)}<div class="modal-body enrollment-body">
    <div class="enrollment-step"><span class="step-number">1</span><div><h3>在目标机器运行客户端</h3><div class="copy-box"><code id="enrollment-command">certrelay-agent enroll</code><button type="button" class="icon-button" data-action="copy-enrollment-command" aria-label="复制客户端命令">${icon('copy')}</button></div></div></div>
    <div class="enrollment-step"><span class="step-number">2</span><div><h3>按 CLI 提示粘贴登记链接</h3><div class="copy-box"><code id="enrollment-link">${escape(link)}</code><button type="button" class="icon-button" data-action="copy-enrollment-link" aria-label="复制登记链接">${icon('copy')}</button></div></div></div>
    <div class="enrollment-step"><span class="step-number">3</span><div><h3>输入验证码，完成一次性校验</h3><div class="verification-code"><code id="enrollment-code">${code}</code><button type="button" class="icon-button" data-action="copy-code" aria-label="复制演示验证码">${icon('copy')}</button></div><p class="enrollment-expiry">有效期至 ${new Date(invitation.expiresAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} · <span id="invitation-countdown"></span> · 仅成功使用一次</p></div></div>
    <div class="form-note">${icon('info')}<span>演示邀请，不具备真实登记能力。正式版验证成功并写入身份文件后，才保存中心地址与独立令牌；验证码在 CLI 中隐藏输入。</span></div>
    <p class="demo-note">链接不含验证码或长期令牌。设备仍为「待登记」，需真实客户端完成通信后才能变为已登记。</p>
    <div class="enrollment-management">${button('regenerate-enrollment', '重新生成', 'refresh', 'secondary', `data-id="${client.id}"`)}${button('revoke-enrollment', '撤销邀请', '', 'danger', `data-id="${client.id}"`)}<small>重新生成后，旧链接和旧验证码一起失效。</small></div>
  </div><div class="modal-footer">${button('close-overlay', '稍后配置')}${button('client-detail', '管理授权', 'arrow', 'primary', `data-id="${client.id}"`)}</div>`, 'modal enrollment-modal', '客户端登记链接与验证码');
  const updateCountdown = () => {
    const remaining = Math.max(0, Math.ceil((invitation.expiresAt - Date.now()) / 1000));
    const usable = invitation.status === 'pending' && remaining > 0;
    const text = invitation.status === 'revoked' ? '已撤销' : remaining ? `剩余 ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}` : '已过期';
    const countdown = document.querySelector('#invitation-countdown');
    if (!countdown) return clearInterval(enrollmentTimer);
    countdown.textContent = text;
    countdown.dataset.expiresAt = String(invitation.expiresAt);
    countdown.dataset.status = invitation.status;
    countdown.className = usable ? '' : 'expired';
    for (const action of ['copy-code', 'copy-enrollment-link', 'revoke-enrollment']) overlayRoot.querySelector(`[data-action="${action}"]`).disabled = !usable;
    if (!usable) {
      document.querySelector('#enrollment-code').textContent = '已失效';
      clearInterval(enrollmentTimer);
    }
  };
  updateCountdown();
  if (invitation.status === 'pending' && invitation.expiresAt > Date.now()) enrollmentTimer = setInterval(updateCountdown, 1000);
}
function openRenew(id) {
  const cert = certById(id);
  if (!cert) return;
  openOverlay(`${modalHeader(cert.pending ? '模拟证书申请' : '模拟一次续期', cert.domain)}<div class="modal-body"><div class="form-note">${icon('refresh')}<span>此操作仅更新示例证书版本与有效期，用于体验后续分发流程。不会联系 CA 或操作 DNS。</span></div><p class="demo-note">正式运行时，只有新证书签发、密钥匹配和完整性校验通过，才会发布给客户端。</p></div><div class="modal-footer">${button('close-overlay', '取消')}${button('confirm-renew', cert.pending ? '模拟申请' : '模拟续期', 'refresh', 'primary', `data-id="${id}"`)}</div>`, 'modal', '模拟证书续期');
}
function distribute(cert) {
  if (!cert || cert.pending) return;
  const delivered = cert.stale.filter((id) => clientById(id)?.online);
  cert.stale = cert.stale.filter((id) => !clientById(id)?.online);
  events.unshift({ type: cert.stale.length ? 'warning' : 'deploy', title: `<strong>${escape(cert.domain)}</strong> ${cert.stale.length ? '仍有客户端等待同步' : '分发检查完成'}`, detail: `演示操作 · ${delivered.length ? `${delivered.length} 台客户端同步新版本` : '在线客户端已是最新版本'}${cert.stale.length ? `，${cert.stale.length} 台离线等待` : ''}`, time: '刚刚' });
  closeOverlay();
  layout();
  toast(cert.stale.length ? `演示检查完成：${cert.stale.length} 台离线客户端继续等待，不会误报成功` : '演示分发完成：所有授权客户端已同步');
}
function openSearch() {
  openOverlay(`<div class="global-search-input">${icon('search')}<input id="global-search" placeholder="搜索域名或客户端…" aria-label="搜索域名或客户端" autofocus><button type="button" class="icon-button" data-action="close-overlay" aria-label="关闭搜索">${icon('close')}</button></div><div id="search-results" class="search-results">${searchResults('')}</div><div class="search-hint">输入名称快速定位 <span style="float:right">ESC 关闭</span></div>`, 'modal search-modal', '搜索证书和客户端');
}
function searchResults(query) {
  const text = query.trim().toLowerCase();
  const certs = certificates.filter((cert) => cert.domain.toLowerCase().includes(text));
  const clients = clientSeed.filter((client) => `${client.name} ${client.label}`.toLowerCase().includes(text));
  if (!certs.length && !clients.length) return emptyState('没有找到匹配结果', '试试域名、设备名称或备注。');
  return certs.map((cert) => `<button type="button" class="search-result" data-action="certificate-detail" data-id="${cert.id}">${icon('globe')}${escape(cert.domain)}<small>证书</small></button>`).join('') + clients.map((client) => `<button type="button" class="search-result" data-action="client-detail" data-id="${client.id}">${icon('server')}${escape(client.name)}<small>${escape(client.label)}</small></button>`).join('');
}
function openHelp() {
  openOverlay(`${modalHeader('少一点维护，多一点安心', 'CertRelay · 个人证书分发中心')}<div class="modal-body"><div class="detail-section" style="margin-top:0"><h3>01 · 在中心添加域名</h3><p class="demo-note">选择 Cloudflare 或阿里云 DNS，统一申请根域名与通配符证书。DNS 凭据留在中心。</p></div><div class="detail-section"><h3>02 · 登记需要证书的设备</h3><p class="demo-note">只登记实际提供 HTTPS 的设备，并单独分配证书权限。通过 Tunnel 接入的设备可能不需要安装网站证书。</p></div><div class="detail-section"><h3>03 · 等待客户端主动更新</h3><p class="demo-note">定时检查新版本，完成校验、安装、服务重载和实际加载验证；失败保留可用版本。</p></div><div class="form-note" style="margin-top:24px">${icon('info')}<span>当前版本是可交互的 UI 原型，所有证书、客户端和操作结果均为示例。尚未实现真实签发、鉴权和分发。</span></div></div><div class="modal-footer">${button('close-overlay', '知道了', 'check', 'primary')}</div>`, 'modal', '使用指南');
}

document.addEventListener('click', async (event) => {
  const element = event.target.closest('[data-action]');
  if (!element || element.disabled) return;
  const action = element.dataset.action;
  const id = element.dataset.id;
  if (action === 'close-overlay') return closeOverlay();
  if (action === 'add-certificate') return openAddCertificate();
  if (action === 'certificate-detail') return openCertificate(id);
  if (action === 'client-detail') return openClient(id);
  if (action === 'add-client') return openAddClient();
  if (action === 'add-credential') return openCredential();
  if (action === 'edit-credential') return openCredential(id);
  if (action === 'delete-credential') return openDeleteCredential(id);
  if (action === 'inspect-credential') return toast('当前是预览，未调用云平台 API，也未验证真实密钥权限');
  if (action === 'confirm-delete-credential') {
    if (credentialReferences(id).length) return openDeleteCredential(id);
    const index = credentials.findIndex((credential) => credential.id === id);
    if (index < 0) return;
    credentials.splice(index, 1);
    closeOverlay(); layout(); return toast('已删除示例记录，未操作云平台密钥');
  }
  if (['view-enrollment', 'regenerate-enrollment', 'revoke-enrollment'].includes(action)) {
    const client = clientById(id);
    if (!client?.waiting) return;
    if (action === 'regenerate-enrollment') client.enrollment = null;
    if (action === 'revoke-enrollment' && client.enrollment) client.enrollment.status = 'revoked';
    showEnrollment(client);
    if (action === 'regenerate-enrollment') toast('已更换示例邀请，旧链接和验证码不再使用');
    if (action === 'revoke-enrollment') toast('示例邀请已撤销，客户端仍为待登记');
    return;
  }
  if (action === 'help') return openHelp();
  if (action === 'search') return openSearch();
  if (action === 'renew-certificate') return openRenew(id);
  if (action === 'distribute') return distribute(certById(id));
  if (action === 'toggle-menu') { state.menu = !state.menu; return layout(); }
  if (action === 'alerts') {
    const pending = certificates.find((cert) => cert.stale.length);
    return pending ? openCertificate(pending.id) : toast('暂无待处理的分发');
  }
  if (action === 'provider-filter') { state.provider = element.dataset.value; return layout(); }
  if (action === 'client-filter') { state.clientFilter = element.dataset.value; return layout(); }
  if (action === 'log-filter') { state.logFilter = element.dataset.value; return layout(); }
  if (action === 'check-all') return toast('演示检查完成；离线客户端保持等待同步，尚未执行真实网络检查');
  if (['copy-code', 'copy-enrollment-link', 'copy-enrollment-command'].includes(action)) {
    const status = document.querySelector('#invitation-countdown');
    if (action !== 'copy-enrollment-command' && (!status || status.dataset.status !== 'pending' || Number(status.dataset.expiresAt) <= Date.now())) return toast('这份邀请已失效，请重新生成');
    const target = { 'copy-code': '#enrollment-code', 'copy-enrollment-link': '#enrollment-link', 'copy-enrollment-command': '#enrollment-command' }[action];
    try { await navigator.clipboard.writeText(document.querySelector(target).textContent); toast('已复制；当前内容仅用于演示'); }
    catch { toast('浏览器不允许复制，请手动选择内容'); }
    return;
  }
  if (action === 'confirm-renew') {
    const cert = certById(id);
    if (!cert) return;
    cert.pending = false;
    cert.days = 90;
    cert.issued = dateIn(0);
    cert.version = `v${dateIn(0).replaceAll('-', '')}.${Date.now().toString().slice(-4)}`;
    cert.stale = [...cert.clients];
    events.unshift({ type: 'renew', title: `<strong>${escape(cert.domain)}</strong> 已生成新的示例版本`, detail: '演示续期 · 等待授权客户端领取，不代表真实证书已签发', time: '刚刚' });
    closeOverlay(); layout(); openCertificate(id);
    toast('示例版本已更新，可继续体验重新分发');
  }
});
document.addEventListener('input', (event) => {
  if (event.target.id === 'certificate-search') {
    state.query = event.target.value;
    document.querySelector('#certificate-list').innerHTML = certificateTable(filteredCertificates());
  }
  if (event.target.id === 'global-search') document.querySelector('#search-results').innerHTML = searchResults(event.target.value);
});
document.addEventListener('change', (event) => {
  if (event.target.id === 'certificate-provider') document.querySelector('#certificate-credential').innerHTML = credentialOptions(event.target.value);
  if (event.target.id === 'credential-provider') document.querySelector('#credential-secret-fields').innerHTML = credentialSecretFields(event.target.value);
});
document.addEventListener('submit', (event) => {
  const form = event.target;
  if (!['certificate-form', 'authorization-form', 'client-form', 'settings-form', 'credential-form'].includes(form.id)) return;
  event.preventDefault();
  const data = new FormData(form);
  const showError = (message) => { form.querySelector('#form-error').textContent = message; };
  if (form.id === 'certificate-form') {
    let domain = String(data.get('domain')).trim().toLowerCase().replace(/^\*\./, '').replace(/\.$/, '');
    if (/[/\\:@\s?#]/.test(domain)) return showError('请输入根域名，不要包含协议、端口或路径。');
    try { domain = new URL(`https://${domain}`).hostname; } catch { return showError('请输入有效的根域名，例如 example.com。'); }
    if (domain.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) return showError('请输入有效的域名，例如 example.com。');
    if (certificates.some((cert) => cert.root === domain)) return showError('这个域名已经在管理列表中了。');
    const credential = credentialById(data.get('credentialId'));
    if (!credential || credential.provider !== data.get('provider')) return showError('请选择与 DNS 托管平台一致的凭据。');
    certificates.push({ id: `cert-${crypto.randomUUID()}`, root: domain, domain: `*.${domain}`, provider: credential.provider, credentialId: credential.id, days: 0, pending: true, version: '待签发', clients: [], stale: [], issued: '—' });
    closeOverlay(); layout(); toast('已添加演示域名，尚未申请真实证书');
  }
  if (form.id === 'authorization-form') {
    const client = clientById(form.dataset.id);
    if (!client) return;
    const selected = data.getAll('certificates');
    for (const cert of certificates) {
      const allowed = selected.includes(cert.id);
      if (allowed && !cert.clients.includes(client.id)) { cert.clients.push(client.id); cert.stale.push(client.id); }
      if (!allowed) { cert.clients = cert.clients.filter((id) => id !== client.id); cert.stale = cert.stale.filter((id) => id !== client.id); }
    }
    events.unshift({ type: 'deploy', title: `<strong>${escape(client.name)}</strong> 的证书授权已变更`, detail: `演示变更 · 允许领取 ${selected.length} 张证书`, time: '刚刚' });
    closeOverlay(); layout(); toast('演示授权已保存，新授权的证书等待客户端同步');
  }
  if (form.id === 'client-form') {
    const name = String(data.get('name')).trim();
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{1,47}$/.test(name)) return showError('名称须为 2–48 位字母、数字、短横线或下划线。');
    if (clientSeed.some((client) => client.name.toLowerCase() === name.toLowerCase())) return showError('这个客户端名称已经存在了。');
    const client = { id: `client-${crypto.randomUUID()}`, name, label: String(data.get('label')).trim() || '新设备', arch: ['amd64', 'arm64', 'armv7'].includes(data.get('arch')) ? data.get('arch') : 'amd64', online: false, waiting: true, seen: '尚未连接', service: '待配置', location: '待登记设备', memory: '待上报' };
    clientSeed.push(client);
    closeOverlay(); layout(); showEnrollment(client);
  }
  if (form.id === 'settings-form') {
    let publicUrl;
    try { publicUrl = normalizeServerUrl(data.get('publicUrl')); }
    catch (error) { document.querySelector('#settings-error').textContent = error.message; return; }
    settings = { renewal: String(data.get('renewal')), interval: String(data.get('interval')), autoDeploy: data.has('autoDeploy'), rollback: data.has('rollback'), publicUrl };
    try { localStorage.setItem('certrelay-ui-settings', JSON.stringify(settings)); }
    catch { return toast('浏览器无法保存设置，请检查存储权限'); }
    layout(); toast('预览设置已保存在本浏览器，未更改服务器配置');
  }
  if (form.id === 'credential-form') {
    const existing = form.dataset.id ? credentialById(form.dataset.id) : null;
    if (form.dataset.id && !existing) return showError('凭据已不存在，请关闭后重新操作。');
    const name = String(data.get('name')).trim();
    if (!name || name.length > 60) return showError('请填写 1–60 位的凭据名称。');
    if (credentials.some((credential) => credential.id !== existing?.id && credential.name.toLowerCase() === name.toLowerCase())) return showError('这个凭据名称已经存在了。');
    const provider = existing?.provider || (data.get('provider') === 'ali' ? 'ali' : 'cf');
    const metadata = { name, provider, note: String(data.get('note')).trim().slice(0, 120), updated: '刚刚' };
    if (existing) Object.assign(existing, metadata);
    else credentials.push({ ...metadata, id: `dns-${crypto.randomUUID()}`, suffix: randomHex(2) });
    closeOverlay(); layout(); toast('已保存示例信息，未接收或保存真实密钥');
  }
});
document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openSearch(); return; }
  if (event.key === 'Escape') {
    if (overlayRoot.children.length) closeOverlay();
    else if (state.menu) { state.menu = false; layout(); }
  }
  if (event.key === 'Tab' && overlayRoot.children.length) {
    const controls = [...overlayRoot.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href],[tabindex="0"]')].filter((element) => element.getClientRects().length);
    const first = controls[0];
    const last = controls.at(-1);
    if (!first) { event.preventDefault(); return; }
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
});
function route() {
  closeOverlay();
  state.page = validPages.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'overview';
  state.menu = false;
  state.query = '';
  layout();
  window.scrollTo(0, 0);
  document.title = `${({ overview: '总览', certificates: '域名证书', credentials: 'DNS 凭据', clients: '客户端', activity: '分发记录', settings: '设置' })[state.page]} · CertRelay`;
}
window.addEventListener('hashchange', route);
route();
