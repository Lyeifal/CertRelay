// Real console. No fixtures, secrets in localStorage, or simulated success states.
const app = document.querySelector('#app');
const overlay = document.querySelector('#overlay-root');
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const icons = { overview: '◈', certificates: '▤', credentials: '⌘', clients: '▣', activity: '↗', settings: '⚙', docs: '?' };
const pages = { overview: '总览', certificates: '域名证书', credentials: 'DNS 凭据', clients: '客户端', activity: '分发记录', settings: '设置', docs: '使用文档' };
const labels = { credential_created: '新增 DNS 凭据', credential_updated: '更新 DNS 凭据', credential_deleted: '删除 DNS 凭据', certificate_created: '新增证书', certificate_updated: '更新证书策略', issuance_queued: '签发已排队', certificate_issued: '签发完成', certificate_issue_failed: '签发失败', agent_enrolled: '客户端登记成功', agent_updated: '更新客户端资料', invitation_created: '生成登记邀请', invitation_revoked: '撤销登记邀请', permissions_updated: '调整证书授权', agent_revoked: '撤销客户端身份', certificate_installed: '客户端安装并验证成功', certificate_install_failed: '客户端安装失败', settings_updated: '更新设置' };
const state = { data: null, csrf: null, page: 'overview', query: '', menu: false, busy: false };
let timer; let invitationTimer; let restoreFocus;
const time = value => value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—';
const provider = value => value === 'cf' ? 'Cloudflare' : '阿里云 DNS';
const badge = (value, kind = '') => `<span class="badge ${kind}"><i class="dot"></i>${escape(value)}</span>`;
const button = (action, value, id = '', kind = 'secondary') => `<button type="button" class="btn btn-${kind}" data-action="${action}" data-id="${escape(id)}">${escape(value)}</button>`;
const field = (label, name, value = '', type = 'text', extra = '') => `<label class="field"><span>${label}</span><input name="${name}" type="${type}" value="${escape(value)}" ${extra}></label>`;
const empty = (value = '还没有记录') => `<div class="empty-state"><h3>${value}</h3><p>配置从这里开始，所有状态均来自你的主服务器。</p></div>`;
const cert = id => state.data.certificates.find(c => c.id === id);
const cred = id => state.data.credentials.find(c => c.id === id);
const agent = id => state.data.agents.find(a => a.id === id);
const active = id => state.data.jobs.find(j => j.certificateId === id && ['running', 'queued'].includes(j.status));
const days = c => c.metadata ? Math.ceil((Date.parse(c.metadata.expiresAt) - Date.now()) / 86400000) : null;
function toast(message) {
  clearTimeout(timer); const target = document.querySelector('#toast-root');
  target.innerHTML = `<div class="toast"><span>${escape(message)}</span></div>`;
  timer = setTimeout(() => { target.innerHTML = ''; }, 6000);
}
async function api(path, method = 'GET', body) {
  const response = await fetch(`/api/v1/${path}`, { method, credentials: 'same-origin', redirect: 'error', headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(state.csrf ? { 'X-CSRF-Token': state.csrf } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000) });
  if (response.status === 204) return;
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401 && path !== 'auth/login') { state.data = null; state.csrf = null; close(); login(); }
    throw new Error(({ admin_login_required: '请重新登录', invalid_password: '密码不正确', password_too_short: '新密码须为 14–1024 个字符，可以自己设置长口令。', csrf_required: '会话失效，请重新登录', duplicate_name: '名称已存在', duplicate_domain: '域名已存在', credential_in_use: '凭据仍有关联证书，不能删除', issuance_in_progress: '签发正在进行，请稍后修改', issuance_cooldown: '签发请求过于频繁，请稍后再试', invalid_email: '请输入有效邮箱', invalid_name: '客户端名称格式不正确', invalid_cf_token: 'Cloudflare Token 格式无效' })[result.error?.code] || result.error?.code || `HTTP ${response.status}`);
  }
  return result;
}
async function refresh(render = true) { state.data = await api('admin/state'); if (render) layout(); }
function login() {
  app.innerHTML = `<main class="login-shell"><section class="panel login-card"><div class="eyebrow">YOUR CERTIFICATE HOME</div><div class="brand-name">CertRelay<span class="heading-dot">.</span></div><h1>让每次更新，都安心抵达。</h1><p class="page-description">登录你的私人证书中心。DNS 密钥留在中心，证书按授权送到需要的地方。</p><form id="login-form">${field('管理员密码', 'password', '', 'password', 'required autocomplete="current-password" autofocus')}<p class="field-error" id="form-error" role="alert"></p><button class="btn btn-primary" type="submit">进入工作空间 →</button></form><p class="demo-note">面板密码由你自己设置，至少 14 个字符。记得密码可在“设置”修改；忘记时请在主服务器终端停服后重置。</p></section><div class="login-decoration"><div class="eyebrow">LESS MAINTENANCE. MORE PEACE.</div><h2>轻一点。<br>安心一点。</h2><p>五个域名，也值得被认真照顾。</p></div></main>`;
}
function heading(title, description, actions = '') { return `<div class="eyebrow">CERTIFICATES, SIMPLIFIED.</div><div class="page-heading"><div><h1>${title}<span class="heading-dot">.</span></h1><p class="page-description">${description}</p></div><div class="heading-actions">${actions}</div></div>`; }
function layout() {
  if (!state.data) return;
  const nav = Object.entries(pages).map(([id, title]) => `<a class="nav-item ${state.page === id ? 'active' : ''}" href="#${id}"><span class="live-nav-icon">${icons[id]}</span><span>${title}</span></a>`).join('');
  app.innerHTML = `<div class="nav-scrim ${state.menu ? 'open' : ''}" data-action="menu"></div><aside class="sidebar ${state.menu ? 'open' : ''}"><a class="brand" href="#overview"><span class="brand-mark">◈</span><span class="brand-name">CertRelay<span class="heading-dot">.</span><small class="brand-caption" style="display:block">YOUR CERTIFICATE HOME</small></span></a><div class="workspace"><span class="workspace-icon">◈</span><span><strong>个人工作空间</strong><small>Private certificate home</small></span></div><div class="nav-label">工作空间</div><nav>${nav}</nav><div class="sidebar-footer"><div class="local-card"><div class="local-status"><i class="dot"></i> 私有部署，自在掌控</div><p>DNS 密钥留在中心<br>证书送到需要的地方</p></div><span class="version">v0.3.1 · 真实数据</span></div></aside><div class="main"><header class="topbar"><button class="icon-button menu-button" data-action="menu" aria-label="打开导航">☰</button><div class="breadcrumb"><span>工作空间</span> › <strong>${pages[state.page]}</strong></div><div class="topbar-right">${badge(state.data.settings.staging ? 'ACME 测试环境' : 'ACME 生产环境', state.data.settings.staging ? 'warning' : '')}${button('refresh', '刷新')}${button('logout', '退出')}</div></header><main class="content">${renderPage()}<footer class="page-footer"><span>你的证书，你的服务器，你的掌控。</span><span>轻一点，安心一点。 · CERTRELAY</span></footer></main></div>`;
  if (state.page === 'settings') app.querySelector('#settings-form')?.insertAdjacentHTML('beforeend', `<div class="settings-section">${button('change-password', '修改管理员密码')}</div>`);
  document.title = `${pages[state.page]} · CertRelay`;
}
function certificateTable(list) {
  if (!list.length) return empty('还没有证书');
  return `<div class="table-wrap"><table class="cert-table"><thead><tr><th>域名 / DNS</th><th>证书状态</th><th>到期时间</th><th>客户端回执</th><th></th></tr></thead><tbody>${list.map(c => {
    const targets = state.data.agents.filter(a => !a.revokedAt && a.certificateIds.includes(c.id));
    const installed = targets.filter(a => c.version && a.receipts[c.id]?.version === c.version && a.receipts[c.id]?.status === 'installed').length;
    const status = active(c.id) ? '签发中' : c.lastError ? '上次签发失败' : c.version ? (c.staging ? '测试证书 · 不安装' : days(c) <= state.data.settings.renewalDays ? '即将续期' : '有效') : '待签发';
    return `<tr><td><button class="domain-name mono btn-text" data-action="certificate" data-id="${c.id}">*.${escape(c.domain)}</button><div class="domain-meta">${escape(cred(c.credentialId)?.name || '—')}</div></td><td>${badge(status, c.lastError || c.staging ? 'warning' : '')}</td><td><span class="mono">${c.metadata ? escape(c.metadata.expiresAt.slice(0, 10)) : '—'}</span><div class="domain-meta">${days(c) === null ? '等待首次签发' : `剩余 ${days(c)} 天`}</div></td><td>${installed} / ${targets.length} 已确认</td><td>${button('issue', active(c.id) ? '签发中' : c.version ? '续期' : '立即申请', c.id, 'text')}${button('certificate', '详情', c.id, 'text')}</td></tr>`;
  }).join('')}</tbody></table></div>`;
}
function activity(list) {
  return list.length ? `<div class="activity-list">${list.map(e => `<div class="activity-item"><span class="activity-symbol ${e.status === 'failed' ? 'warning' : ''}">${e.status === 'failed' ? '!' : '✓'}</span><div class="activity-main"><p>${escape(labels[e.action] || e.action)}</p><small>${escape(e.subject)}</small></div><time class="activity-time">${time(e.at)}</time></div>`).join('')}</div>` : empty('重要的变化会留在这里');
}
function docsPage() {
  const code = (value) => `<pre class="docs-code"><code>${escape(value)}</code></pre>`;
  return `${heading('从第一次使用开始', '先分清面板密码和机器密钥，再了解证书放在哪里。下方命令均在标明的服务器终端执行。')}
    <div class="docs-grid">
      <section class="panel docs-section"><h2 class="panel-title">1. 登录面板用什么密码？</h2><p>面板密码由你自己设置，不是客户端令牌、DNS 密钥或证书私钥。至少 14 个字符，不要求特殊符号；可用自己独有、容易记住的长口令，不要使用文档示例作为真实密码。</p><p>记得旧密码：左侧“设置”→“修改管理员密码”，保存后重新登录。首次设置只做一次；不会生成一个让你每天手输的随机密钥。</p><p>忘记密码：在主服务器终端先停服，重置，再启动（会短暂影响面板和拉取，不会删除已安装证书）：</p>${code('systemctl stop certrelay\ncertrelay reset-password --data-dir /var/lib/certrelay\nsystemctl start certrelay')}<p>reset-password 快捷入口为本地 0.3.1 新增，尚未发布/部署；现有旧版可在中间一步用下面命令替代。数据目录若自定义过请改为实际路径：</p>${code('sudo -u certrelay env CERTRELAY_DATA_DIR=/var/lib/certrelay certrelay-reset-password')}<p>旧手工部署未安装全局命令时，使用已有 Node 和部署脚本；路径按实际位置调整，不要复制到新目录重新初始化：</p>${code('sudo -u certrelay env CERTRELAY_DATA_DIR=/var/lib/certrelay /opt/certrelay/node/bin/node /opt/certrelay/scripts/reset-admin.mjs')}<p>不可删除 master.key、state.json 或运行中实例的 server.lock 来“重置密码”。</p></section>
      <section class="panel docs-section"><h2 class="panel-title">2. 申请好的证书到底在哪里？</h2><p>主服务器默认把证书和 DNS 凭据加密保存在 /var/lib/certrelay/state.json，master.key 用于解密。它们不是 Nginx 可以直接引用的证书文件。源码开发启动的默认目录则是工作目录下的 data。</p><p>其他服务器需先登记、获得证书授权，再同步成功，才会生成证书文件。默认位置如下，example.com 要换成申请时填的根域名，不带 *.：</p>${code('/etc/certrelay-certs/example.com/current/fullchain.pem\n/etc/certrelay-certs/example.com/current/privkey.pem')}<p>fullchain.pem 是证书链，privkey.pem 是私钥；Nginx 需要这两个文件。current 始终指向当前版本，不要固定引用 versions 下的旧版本。</p><p>路径以每台客户端 /etc/certrelay-agent/config.json 的 directoryRoot（或旧 certificates 映射）为准。主服务器自身也要加载证书时，同样运行客户端；不会自动把服务端加密数据变成 PEM。</p>${code('certrelay paths --domain example.com')}<p>paths 为本地 0.3.1 新增，只显示本机配置推导的路径，不显示私钥；输出路径不代表文件已存在。</p></section>
      <section class="panel docs-section"><h2 class="panel-title">3. 第一次申请和分发怎么做？</h2><p>① 主面板“设置”填写 ACME 邮箱；②“DNS 凭据”添加对应 Cloudflare 或阿里云密钥；③“域名证书”添加根域名，例如 example.com，程序同时申请 example.com 和 *.example.com；④ 点击证书行“立即申请”或详情中的“立即申请 / 续期”。</p><p>测试环境用于验证配置，但测试证书不会安装。准备好后在“设置”关闭测试环境，再申请生产证书，并检查签发任务成功。</p><p>⑤“客户端”生成一次性邀请并选择允许领取的证书；⑥ 在目标小服务器登记；⑦ 启用同步并查看 installed 或 verified 回执。在线只代表有通信，不代表证书已经落盘。</p></section>
      <section class="panel docs-section"><h2 class="panel-title">4. 在小服务器登记并自动拉取</h2><p>先装兼容本机的 Node.js 和 npm。以下安装步骤仅用于新客户端，不要在已有部署上重新登记或覆盖配置：</p>${code('npm install -g certrelay\ncertrelay install-agent\ncertrelay-agent enroll --identity /etc/certrelay-agent/identity.json')}<p>按终端提示粘贴邀请链接、输入 8 位验证码（输入不显示）。链接默认 10 分钟有效且成功只能使用一次；关闭后不能恢复验证码，未登记的邀请可重新生成。</p><p>分开安装、登记后，还需要自己启用定时器。下列命令也用于已登记客户端立即拉取：</p>${code('systemctl enable --now certrelay-agent.timer\nsystemctl start certrelay-agent.service\njournalctl -u certrelay-agent.service -n 30 --no-pager')}<p>定时任务约每 30 分钟检查一次，执行后显示 inactive 正常。心跳成功只代表联通；installed 是新证书安装成功，verified 是已安装版本验证成功。results: [] 通常表示尚未授权可下载的证书或尚未生产签发。</p></section>
      <section class="panel docs-section"><h2 class="panel-title">5. Nginx 填哪两个路径？</h2><p>在客户端 Nginx 的 HTTPS 站点中填写，不是在主服务器的加密数据文件中找。下面以 example.com 为例：</p>${code('ssl_certificate /etc/certrelay-certs/example.com/current/fullchain.pem;\nssl_certificate_key /etc/certrelay-certs/example.com/current/privkey.pem;')}<p>客户端自定义了目录就用实际路径。中文域名在目录中使用 xn-- 开头的 ASCII 形式。先确认文件已安装，再检查和重载：</p>${code('nginx -t\nsystemctl reload nginx')}<p>首次部署要先准备一个能正常运行和重载的 HTTPS 站点；不要提前引用不存在的 current 文件导致 Nginx 无法启动。有旧证书时先保留它，具体首次引导需按本机站点处理，安装器不会自动完成。</p></section>
      <section class="panel docs-section"><h2 class="panel-title">6. 哪些“密钥”需要自己记？</h2><p>你自己记住/交给密码管理器的是面板密码。DNS Token/AccessKey 从云厂商获取，只填在主面板；客户端令牌登记后自动存入 identity.json；证书私钥和 master.key 均由程序管理，不要改成短密码或发送给别人。</p><p>备份时把实际服务端数据目录中的 master.key 和 state.json 一起加密保存。更改面板密码不需要重新申请证书，不会更换 DNS 密钥或客户端身份。请勿在聊天或截图中展示密钥内容。</p></section>
    </div>`;
}
function renderPage() {
  const d = state.data;
  const registeredAgentIds = new Set(d.agents.filter(a => !a.revokedAt).map(a => a.id));
  const registeredAgentNames = new Set(d.agents.filter(a => !a.revokedAt).map(a => a.name.toLowerCase()));
  if (state.page === 'docs') return docsPage();
  if (state.page === 'overview') {
    const online = d.agents.filter(a => a.status === 'online').length;
    const pending = d.agents.filter(a => !a.revokedAt).reduce((sum, a) => sum + a.certificateIds.filter(id => cert(id)?.version && (a.receipts[id]?.version !== cert(id).version || a.receipts[id]?.status !== 'installed')).length, 0);
    const metrics = [['管理中的证书', d.certificates.length, '集中申请，按需分发'], ['在线客户端', online, `${d.agents.filter(a => !a.revokedAt).length} 台已登记设备`], ['等待同步', pending, '只有实际安装回执才计为同步'], ['需要续期', d.certificates.filter(c => days(c) !== null && days(c) <= d.settings.renewalDays).length, `提前 ${d.settings.renewalDays} 天检查`]];
    return `${heading('证书分发，一目了然', '从签发到每一次更新，让你的域名一直安心在线。', button('check-renewals', '检查续期') + button('add-certificate', '添加证书', '', 'primary'))}<div class="metrics">${metrics.map(([title, count, foot]) => `<section class="metric"><div class="metric-label">${title}</div><div class="metric-value">${count}</div><div class="metric-foot">${foot}</div></section>`).join('')}</div><div class="overview-grid"><div><section class="panel"><div class="panel-heading"><h2 class="panel-title">域名证书</h2><a href="#certificates" class="btn-text">查看全部 →</a></div>${certificateTable(d.certificates)}</section><section class="panel activity-panel"><div class="panel-heading"><h2 class="panel-title">最近动态</h2></div>${activity(d.events.slice(0, 5))}</section></div><aside class="right-stack"><section class="automation-card"><div class="eyebrow">LESS MAINTENANCE. MORE PEACE.</div><h3>续期这件事，交给它。</h3><p>集中申请，按需分发。<br>让每台小服务器都轻装上阵。</p></section><section class="panel settings-note"><h3>每一步，分别确认。</h3>签发成功不等于安装成功。<br>客户端完成本地校验、重载与 TLS 指纹验证后，才会写入安装回执。<br><br>当前：${d.settings.staging ? '测试 CA，客户端拒绝安装测试证书。' : '生产 CA，请谨慎使用签发额度。'}</section></aside></div>`;
  }
  if (state.page === 'certificates') return `${heading('每一个域名，妥善照顾', '同时管理根域名与一级通配符。', button('add-certificate', '添加证书', '', 'primary'))}<section class="panel">${certificateTable(d.certificates)}</section>`;
  if (state.page === 'credentials') return `${heading('密钥归中心，权限有边界', '写入后不再显示明文；修改时可只替换密钥。', button('add-credential', '添加 DNS 凭据', '', 'primary'))}<div class="policy-summary">AES-256-GCM 加密保存 · 不写入浏览器存储 · 不下发至客户端</div><div class="credential-grid">${d.credentials.map(c => `<section class="panel credential-card"><div class="client-card-top"><span class="credential-provider">⌘</span>${badge('已加密 · 权限待签发验证', 'neutral')}</div><h2>${escape(c.name)}</h2><p class="credential-subtitle">${provider(c.provider)}</p><div class="credential-mask mono">•••••••• · 不可回读</div><p class="credential-note">${escape(c.note)}</p><dl class="client-meta"><div><dt>关联域名</dt><dd>${d.certificates.filter(x => x.credentialId === c.id).length}</dd></div><div><dt>更新</dt><dd>${time(c.updatedAt)}</dd></div></dl><div class="credential-card-footer">${button('credential', '编辑 / 替换密钥', c.id)}${button('delete-credential', '删除', c.id, 'text')}</div></section>`).join('') || empty('先添加一份 DNS 凭据')}</div>`;
  if (state.page === 'clients') return `${heading('从中心，到每一台', '令牌绑定实例；撤销授权不删除客户端已安装的证书。', button('add-client', '登记客户端', '', 'primary'))}<div class="client-grid">${d.agents.map(a => `<section class="panel client-card"><div class="client-card-top"><span class="client-server-icon">▣</span>${badge(({ online: '在线', offline: '离线', revoked: '已撤销' })[a.status], a.status === 'online' ? '' : 'neutral')}</div><h3>${escape(a.name)}</h3><p class="client-host">${escape(a.label || a.hostname || '')}</p><dl class="client-meta"><div><dt>架构</dt><dd>${escape(a.arch)}</dd></div><div><dt>授权证书</dt><dd>${a.certificateIds.length} 张</dd></div></dl><p class="demo-note">最近通信 ${time(a.lastSeen)}</p><div class="client-card-footer">${button('edit-agent', '编辑资料', a.id, 'text')}${a.revokedAt ? '此身份已不可使用' : button('agent', '管理授权', a.id)}${!a.revokedAt ? button('revoke-agent', '撤销身份', a.id, 'text') : ''}</div></section>`).join('') || empty('还没有设备登记')}</div><section class="panel live-invitations"><div class="panel-heading"><h2 class="panel-title">登记邀请</h2></div>${d.invitations.map(i => `<div class="live-invitation"><span><strong>${escape(i.name)}</strong><small>${time(i.expires_at)}</small></span>${badge(i.status, i.status === 'pending' ? '' : 'neutral')}<span class="invitation-actions">${i.status !== 'used' && !registeredAgentIds.has(i.agent_id) && !registeredAgentNames.has(i.name.toLowerCase()) ? button('regenerate-invitation', '重新生成', i.invitation_id, 'text') : ''}${i.status === 'pending' ? button('revoke-invitation', '撤销', i.invitation_id, 'text') : ''}</span></div>`).join('') || empty('验证码关闭后不可恢复，可重新生成')}</section>`;
  if (state.page === 'activity') return `${heading('每次更新，都有迹可循', '签发、授权、安装与失败记录，不包含秘密。')}<section class="panel history-panel">${activity(d.events)}</section><section class="panel live-invitations"><div class="panel-heading"><h2 class="panel-title">签发任务</h2></div>${d.jobs.map(j => `<div class="live-invitation"><span>${escape(cert(j.certificateId)?.domain || j.certificateId)}<small>${time(j.createdAt)}</small></span>${badge(j.status, j.status === 'failed' ? 'warning' : '')}<small>${escape(j.error || '')}</small></div>`).join('') || empty()}</section>`;
  return `${heading('刚刚好的自动化', '设置保存在主服务器，不在浏览器里。')}<form id="settings-form" class="panel settings-panel live-settings">${field('中心地址（部署配置固定，迁移需单独操作）', 'publicUrl', d.settings.publicUrl, 'url', 'disabled')}${field('ACME 账户邮箱', 'email', d.settings.email, 'email', 'required maxlength="254"')}${field('提前续期天数', 'renewalDays', d.settings.renewalDays, 'number', 'min="7" max="60" required')}${field('服务端续期检查间隔（分钟）', 'checkMinutes', d.settings.checkMinutes, 'number', 'min="5" max="1440" required')}<label class="checkbox-field"><input type="checkbox" name="staging" ${d.settings.staging ? 'checked' : ''}>使用 Let’s Encrypt 测试环境（推荐先验证）</label><p class="demo-note">测试证书不会被客户端安装。关闭后将向生产 CA 申请，受签发额度限制。客户端轮询周期由各机 systemd timer 控制；安装命令只在客户端本地配置。</p><p id="form-error" class="field-error" role="alert"></p><button class="btn btn-primary" type="submit">保存设置</button></form>`;
}
function close() { clearInterval(invitationTimer); overlay.innerHTML = ''; app.inert = false; document.body.style.overflow = ''; restoreFocus?.isConnected && restoreFocus.focus(); }
function modal(title, description, content, form = '', id = '') {
  if (!overlay.children.length) restoreFocus = document.activeElement;
  clearInterval(invitationTimer);
  overlay.innerHTML = `<div class="overlay-backdrop" data-action="close"></div><section class="modal" role="dialog" aria-modal="true" aria-label="${escape(title)}"><div class="modal-header"><div><h2>${escape(title)}</h2><p>${escape(description)}</p></div><button class="icon-button" data-action="close" aria-label="关闭">×</button></div>${form ? `<form id="${form}" data-id="${escape(id)}">` : ''}<div class="modal-body">${content}<p id="form-error" class="field-error" role="alert"></p></div><div class="modal-footer">${button('close', '关闭')}${form ? '<button class="btn btn-primary" type="submit">保存</button>' : ''}</div>${form ? '</form>' : ''}</section>`;
  app.inert = true; document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => overlay.querySelector('input,select,button')?.focus());
}
const scopes = selected => `<div class="scope-options">${state.data.certificates.map(c => `<label class="scope-option"><input type="checkbox" name="certificateIds" value="${c.id}" ${selected.includes(c.id) ? 'checked' : ''}>*.${escape(c.domain)}</label>`).join('') || '<p class="demo-note">暂无证书，可在登记后授权。</p>'}</div>`;
function secretFields(platform, optional) {
  const extra = `${optional ? '' : 'required'} autocomplete="new-password"`;
  return platform === 'cf' ? field('API Token', 'token', '', 'password', extra) + field('Account ID（可选）', 'accountId') + field('Zone ID（可选）', 'zoneId') : field('AccessKey ID', 'accessKeyId', '', 'password', extra) + field('AccessKey Secret', 'accessKeySecret', '', 'password', extra);
}
function credentialModal(id) {
  const c = id ? cred(id) : null;
  modal(c ? '编辑 DNS 凭据' : '添加 DNS 凭据', c ? '密钥字段全部留空则保留原值。' : '请使用最小权限的 DNS 凭据。', field('名称', 'name', c?.name, 'text', 'required maxlength="60"') + `<label class="field"><span>DNS 平台</span><select id="live-provider" name="provider" ${c ? 'disabled' : ''}><option value="cf">Cloudflare</option><option value="ali" ${c?.provider === 'ali' ? 'selected' : ''}>阿里云 DNS</option></select></label><div id="live-secret-fields">${secretFields(c?.provider || 'cf', !!c)}</div>` + field('备注', 'note', c?.note, 'text', 'maxlength="120"'), 'credential-form', id);
}
function showInvitation(i) {
  modal('登记邀请已就绪', '十分钟有效，成功只能使用一次。验证码关闭后不可回读。', `<div class="enrollment-step"><div><h3>1 · 在目标设备运行客户端</h3><div class="copy-box"><code>certrelay-agent enroll</code></div><h3>2 · 粘贴登记链接</h3><div class="copy-box"><code id="enrollment-link">${escape(i.enrollment_url)}</code>${button('copy-link', '复制')}</div><h3>3 · 输入验证码（CLI 隐藏输入）</h3><div class="verification-code"><code id="enrollment-code">${escape(i.code.slice(0, 4))} ${escape(i.code.slice(4))}</code>${button('copy-code', '复制')}</div><p class="enrollment-expiry" id="live-countdown"></p></div></div><p class="demo-note">首次通过验证后，客户端才持久保存中心地址和独立令牌。主机名和 IP 不是硬件身份证明。</p>`);
  const update = () => {
    const seconds = Math.max(0, Math.ceil((Date.parse(i.expires_at) - Date.now()) / 1000));
    const target = overlay.querySelector('#live-countdown'); if (!target) return clearInterval(invitationTimer);
    target.textContent = seconds ? `剩余 ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} · 仅成功使用一次` : '邀请已过期';
    if (!seconds) { overlay.querySelector('#enrollment-code').textContent = '已过期'; overlay.querySelectorAll('[data-action^="copy-"]').forEach(b => { b.disabled = true; }); clearInterval(invitationTimer); }
  }; update(); invitationTimer = setInterval(update, 1000);
}
document.addEventListener('click', async event => {
  const target = event.target.closest('[data-action]'); if (!target || target.disabled || state.busy) return;
  const { action, id } = target.dataset;
  try {
    if (action === 'close') return close();
    if (action === 'menu') { state.menu = !state.menu; return layout(); }
    if (action === 'refresh') return await refresh();
    if (action === 'logout') { await api('auth/logout', 'POST', {}); state.csrf = null; state.data = null; close(); return login(); }
    if (action === 'add-credential' || action === 'credential') return credentialModal(id);
    if (action === 'add-certificate') return modal('让新域名安心在线', '添加域名不会立即申请，确认后手动签发或由续期任务执行。', field('根域名', 'domain', '', 'text', 'required maxlength="253" placeholder="example.com"') + `<label class="field"><span>DNS 凭据</span><select name="credentialId" required>${state.data.credentials.map(c => `<option value="${c.id}">${escape(c.name)} · ${provider(c.provider)}</option>`).join('')}</select></label><label class="checkbox-field"><input name="autoRenew" type="checkbox" checked>自动申请与续期</label>`, 'certificate-form');
    if (action === 'certificate') {
      const c = cert(id); const jobs = state.data.jobs.filter(j => j.certificateId === id).slice(0, 3);
      return modal(`*.${c.domain}`, '签发和安装，分别确认。', `<dl class="detail-list"><div><dt>版本</dt><dd class="mono">${escape(c.version || '待签发')}</dd></div><div><dt>到期</dt><dd>${time(c.metadata?.expiresAt)}</dd></div><div><dt>签发机构</dt><dd>${escape(c.metadata?.issuer || '—')}</dd></div><div><dt>指纹</dt><dd class="mono">${escape(c.metadata?.fingerprint || '—')}</dd></div><div><dt>环境</dt><dd>${c.staging ? '测试 · 不分发安装' : c.version ? '生产' : '尚未签发'}</dd></div></dl><label class="field" style="margin-top:20px"><span>DNS 凭据</span><select name="credentialId">${state.data.credentials.map(k => `<option value="${k.id}" ${k.id === c.credentialId ? 'selected' : ''}>${escape(k.name)}</option>`).join('')}</select></label><label class="checkbox-field"><input name="autoRenew" type="checkbox" ${c.autoRenew ? 'checked' : ''}>自动续期</label>${button('issue', active(id) ? '签发任务进行中' : '立即申请 / 续期', id)}<div class="detail-section"><h3>客户端回执</h3>${state.data.agents.filter(a => !a.revokedAt && a.certificateIds.includes(id)).map(a => `<div class="detail-client">${escape(a.name)}${badge(a.receipts[id]?.version === c.version && a.receipts[id]?.status === 'installed' ? '已验证安装' : '待同步', 'neutral')}</div>`).join('') || '<p class="demo-note">暂无授权客户端</p>'}</div><p class="demo-note">${jobs.map(j => `${escape(j.status)} · ${time(j.createdAt)}`).join('<br>')}</p>`, 'certificate-settings-form', id);
    }
    if (action === 'add-client') return modal('欢迎一台新设备', '链接和验证码分开提供，默认十分钟有效。', field('客户端名称', 'name', '', 'text', 'required pattern="[a-zA-Z0-9][a-zA-Z0-9_-]{1,47}" maxlength="48"') + field('备注', 'label', '', 'text', 'maxlength="60"') + '<label class="field"><span>架构</span><select name="arch"><option>amd64</option><option>arm64</option><option>armv7</option></select></label><label class="field"><span>允许领取的证书</span></label>' + scopes([]), 'client-form');
    if (action === 'regenerate-invitation') { const next = await api(`admin/enrollments/${id}/regenerate`, 'POST', {}); await refresh(); return showInvitation(next); }
    if (action === 'change-password') return modal('修改管理员密码', '完成后所有管理员会话失效，需要重新登录。', field('当前密码', 'currentPassword', '', 'password', 'required autocomplete="current-password"') + field('新密码（自己设置，至少 14 个字符）', 'newPassword', '', 'password', 'required minlength="14" maxlength="1024" autocomplete="new-password"') + field('再次输入新密码', 'confirmPassword', '', 'password', 'required minlength="14" maxlength="1024" autocomplete="new-password"') + '<p class="demo-note">可用容易记住的独有长口令，不要求随机字符或特殊符号。不是客户端令牌，也不是证书私钥。</p>', 'password-form');
    if (action === 'edit-agent') {
      const a = agent(id);
      return modal('编辑客户端资料', '修改名称和备注不会更换客户端令牌。', field('客户端名称', 'name', a?.name, 'text', 'required pattern="[a-zA-Z0-9][a-zA-Z0-9_-]{1,47}" maxlength="48"') + field('备注', 'label', a?.label || '', 'text', 'maxlength="60"'), 'agent-form', id);
    }
    if (action === 'agent') return modal(agent(id).name, '取消授权只阻止后续领取，不删除设备现有证书。', scopes(agent(id).certificateIds), 'permissions-form', id);
    if (['delete-credential', 'revoke-agent', 'revoke-invitation', 'issue'].includes(action)) {
      const descriptions = { 'delete-credential': '删除此记录？不会吊销云端密钥。', 'revoke-agent': '撤销后此客户端的令牌立即不可用，需重新登记。', 'revoke-invitation': '撤销此邀请？旧链接和验证码将不能再使用。', issue: '确认申请？将实际调用 DNS API 和 ACME CA，请检查当前测试/生产环境。' };
      modal('确认操作', descriptions[action], `<p class="demo-note">${escape(id)}</p><input type="hidden" name="action" value="${action}">`, 'confirmation-form', id); return;
    }
    if (action === 'check-renewals') { await api('admin/check-renewals', 'POST', {}); await refresh(); return toast('已按到期策略检查并排队，需要时才签发。'); }
    if (action === 'copy-link' || action === 'copy-code') { await navigator.clipboard.writeText(overlay.querySelector(action === 'copy-link' ? '#enrollment-link' : '#enrollment-code').textContent.replace(action === 'copy-code' ? /\s/g : /$^/, '')); toast('已复制，请妥善保管。'); }
  } catch (error) { toast(error.message); }
});
document.addEventListener('change', event => { if (event.target.id === 'live-provider') overlay.querySelector('#live-secret-fields').innerHTML = secretFields(event.target.value, false); });
document.addEventListener('submit', async event => {
  const form = event.target; if (!form.matches('form')) return; event.preventDefault(); if (state.busy) return;
  const values = new FormData(form); const id = form.dataset.id;
  state.busy = true; form.querySelectorAll('button[type="submit"]').forEach(b => { b.disabled = true; });
  try {
    if (form.id === 'login-form') {
      const result = await api('auth/login', 'POST', { password: values.get('password') }); form.reset(); state.csrf = result.csrf; await refresh(); return;
    }
    if (form.id === 'credential-form') {
      const platform = id ? cred(id).provider : values.get('provider');
      const secret = platform === 'cf' ? { token: values.get('token'), accountId: values.get('accountId'), zoneId: values.get('zoneId') } : { accessKeyId: values.get('accessKeyId'), accessKeySecret: values.get('accessKeySecret') };
      const filled = Object.values(secret).some(Boolean);
      await api(`admin/credentials${id ? `/${id}` : ''}`, id ? 'PATCH' : 'POST', { name: values.get('name'), note: values.get('note'), provider: platform, ...(filled || !id ? { secret } : {}) }); form.reset();
    }
    if (form.id === 'certificate-form') await api('admin/certificates', 'POST', { domain: values.get('domain'), credentialId: values.get('credentialId'), autoRenew: values.has('autoRenew') });
    if (form.id === 'certificate-settings-form') await api(`admin/certificates/${id}`, 'PATCH', { autoRenew: values.has('autoRenew'), credentialId: values.get('credentialId') });
    if (form.id === 'client-form') {
      const invitation = await api('admin/enrollments', 'POST', { name: values.get('name'), label: values.get('label'), arch: values.get('arch'), certificateIds: values.getAll('certificateIds') });
      await refresh(); showInvitation(invitation); return;
    }
    if (form.id === 'permissions-form') await api(`admin/agents/${id}/permissions`, 'POST', { certificateIds: values.getAll('certificateIds') });
    if (form.id === 'agent-form') await api(`admin/agents/${id}`, 'PATCH', { name: values.get('name'), label: values.get('label') });
    if (form.id === 'password-form') {
      if (values.get('newPassword') !== values.get('confirmPassword')) throw new Error('两次新密码不一致，请重新输入。');
      await api('admin/password', 'POST', { currentPassword: values.get('currentPassword'), newPassword: values.get('newPassword') }); form.reset();
      state.csrf = null; state.data = null; close(); login(); toast('密码已修改，请重新登录。'); return;
    }
    if (form.id === 'confirmation-form') {
      const action = values.get('action');
      const endpoints = { 'delete-credential': [`admin/credentials/${id}`, 'DELETE'], 'revoke-agent': [`admin/agents/${id}/revoke`, 'POST'], 'revoke-invitation': [`admin/enrollments/${id}/revoke`, 'POST'], issue: [`admin/certificates/${id}/issue`, 'POST'] };
      await api(...endpoints[action], {});
    }
    if (form.id === 'settings-form') await api('admin/settings', 'PATCH', { email: values.get('email'), renewalDays: Number(values.get('renewalDays')), checkMinutes: Number(values.get('checkMinutes')), staging: values.has('staging') });
    close(); await refresh(); toast('已保存到主服务器。');
  } catch (error) {
    const target = form.querySelector('#form-error'); if (target?.isConnected) target.textContent = error.message; else toast(error.message);
  } finally { state.busy = false; form.querySelectorAll('button[type="submit"]').forEach(b => { b.disabled = false; }); }
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') close();
  if (event.key === 'Tab' && overlay.children.length) {
    const items = [...overlay.querySelectorAll('button:not(:disabled),input:not(:disabled):not([type="hidden"]),select:not(:disabled),a[href]')];
    if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1)?.focus(); }
    else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0]?.focus(); }
  }
});
window.addEventListener('hashchange', () => { close(); state.page = pages[location.hash.slice(1)] ? location.hash.slice(1) : 'overview'; state.menu = false; layout(); });
state.page = pages[location.hash.slice(1)] ? location.hash.slice(1) : 'overview';
async function boot() {
  try { state.csrf = (await api('auth/session')).csrf; await refresh(); } catch { login(); }
}
boot();
const liveRefreshTimer = setInterval(async () => {
  if (!state.csrf || state.busy || overlay.children.length || document.hidden || ['INPUT', 'SELECT'].includes(document.activeElement?.tagName)) return;
  try { await refresh(); } catch {}
}, 5000);
