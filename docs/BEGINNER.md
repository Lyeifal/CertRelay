# CertRelay 小白使用指南

默认环境：Linux + systemd + Nginx。下面命令均在标明的服务器 SSH 终端执行，不是在网页输入。

安装、停启服务和重置密码的命令按 root 终端书写；普通管理用户请使用 sudo。不要把面板密码输入到聊天或命令参数里。

## 先分清主服务器和客户端

- 主服务器运行面板，保存 CF/阿里云 DNS 凭据，申请和续期证书。
- 客户端是需要证书的小机器，只领取已授权的证书，不保存 DNS 凭据。
- 主服务器自身的业务也要加载证书时，同样运行一个客户端，把加密保存的证书安装成 Nginx 能读取的文件；无需重复申请。

## 哪些密码需要自己记？

| 名称 | 用途 | 如何使用 |
| --- | --- | --- |
| 面板管理员密码 | 浏览器登录 CertRelay | 自己设置，登录时输入 |
| 一次性验证码 | 初次登记客户端 | 默认十分钟有效，成功只用一次 |
| 客户端令牌 | 客户端证明身份 | 登记后自动保存，不需要记忆 |
| CF Token / 阿里云 AccessKey | 申请证书时修改 DNS | 从云厂商获取，只在主面板填写 |
| privkey.pem | Nginx 提供 HTTPS | 程序保存，不需要手工输入 |
| master.key | 解密服务端证书与 DNS 凭据 | 程序自动使用，必须与 state.json 一起备份 |

自动生成的机器密钥不需要每天输入，也不应为了好记而改短。面板密码才是你自己选择的口令。

## 版本说明：不要混淆新旧命令

- 公共 npm 已发布 **0.3.0**，有 `certrelay-init`、`certrelay-reset-password`、`certrelay-agent` 和两个 install 命令。
- 本地开发 **0.3.1** 尚未发布/部署，新增 `certrelay init-admin`、`certrelay reset-password`、`certrelay paths`，改善目录识别及提示。
- 在本项目可用 `node scripts/certrelay.mjs --help` 运行新版；`npm install -g certrelay` 暂不会取得这些新功能。
- 安装器尚未完成真实 Linux 首装/systemd 验收，已有生产部署不用重装。npm 安装不包含 Node.js、Nginx、acme.sh、HTTPS 引导或 DNS 配置。

## 第一次设置面板密码

密码由你自己输入，至少 14 个字符，最多 1024 个；不要求随机字符或特殊符号。建议使用独有的长口令，不与其他网站共用，不要照抄公开示例密码。

**只在主服务器执行。** 默认生产数据目录为 `/var/lib/certrelay`，自定义过就替换成实际目录。首次设置用 init；已有管理员不能用 init 覆盖。

本地新版安装后：

```bash
systemctl stop certrelay
certrelay init-admin --data-dir /var/lib/certrelay
systemctl start certrelay
```

公共 0.3.0，在已经创建 certrelay 用户和数据目录的部署中，中间一行用：

```bash
sudo -u certrelay env CERTRELAY_DATA_DIR=/var/lib/certrelay certrelay-init
```

隐藏输入没有字符或星号是正常的，输入完按回车。新版交互终端要求再次确认，然后使用自己设置的密码访问 HTTPS 面板域名。

### 记得旧密码，想换成好记的密码

左侧“设置”→“修改管理员密码”，输入当前密码和自己选择的新密码。新版要求再次确认，保存后所有管理员会话失效，需要重新登录。客户端不用重新登记，证书不用重新申请。

### 忘记密码后重置

**在主服务器 SSH 终端执行，不在客户端执行。** 需要你有服务器管理权限，这不是一个公开的任意人可调用的重置入口。

本地新版：

```bash
systemctl stop certrelay
certrelay reset-password --data-dir /var/lib/certrelay
systemctl start certrelay
```

公共 0.3.0：中间一行替换为：

```bash
sudo -u certrelay env CERTRELAY_DATA_DIR=/var/lib/certrelay certrelay-reset-password
```

旧手工部署没有全局命令时，停服后用已有部署脚本；Node.js 和脚本路径按实际部署调整：

```bash
sudo -u certrelay env CERTRELAY_DATA_DIR=/var/lib/certrelay \
  node /opt/certrelay/scripts/reset-admin.mjs
```

完成后再 `systemctl start certrelay`。新密码自己输入，不放在命令行、不发到聊天。停服期间主面板/拉取短暂不可用，Nginx 已加载的证书不受影响。

新版依次考虑 `--data-dir`、`CERTRELAY_DATA_DIR`、`/etc/certrelay/server.env`，都没有时才用当前目录的 `data`（开发默认）。重置找不到原 state.json/master.key 时会拒绝，不会创建替代数据。提示锁定时先确认没有运行实例，**不要删除运行中实例的 server.lock，更不能删除 state.json 或 master.key 来重置**。

## 申请证书并授权客户端

在主面板按顺序做：

1. “设置”填写 ACME 邮箱，首次验证可先保留测试环境。
2. “DNS 凭据”添加对应 Cloudflare Token 或阿里云 AccessKey。按域名实际 DNS 托管商选择，不是按服务器厂商选择。
3. “域名证书”点击“添加证书”，填根域名 `example.com`，不要填 URL 或 `*.example.com`。程序会同时申请根域名和一级通配符。
4. 点击证书行“立即申请”或详情中的“立即申请 / 续期”，在“分发记录”看任务结果。DNS 验证可能要几分钟，不要反复点击。
5. 测试通过后在“设置”关闭测试环境，再申请生产证书。**测试证书不会安装**，只有生产签发成功才有可安装版本。
6. “客户端”登记时选择允许领取的证书；已登记的客户端点“管理授权”。新增域名不会默认授权给所有机器。

`*.example.com` 支持 `a.example.com`，不覆盖 `a.b.example.com`；根域名由同一张证书中的另一条域名覆盖。

## 在小服务器登记客户端

已有客户端不要重登。下面只用于已准备好 Node.js、npm、Nginx 的新客户端；安装器不会自动配置你的业务站点。

```bash
npm install -g certrelay@0.3.0
certrelay install-agent
certrelay-agent enroll --identity /etc/certrelay-agent/identity.json
```

依提示粘贴邀请链接，输入 8 位验证码（隐藏输入）。成功后才保存服务端地址和独立长期令牌。链接/验证码默认十分钟有效且成功只能用一次；关掉弹窗后不可回读，未登记的邀请可重新生成，已登记成功的机器不用再生成。

分开安装、登记后还需要启用定时器：

```bash
systemctl enable --now certrelay-agent.timer
systemctl start certrelay-agent.service
journalctl -u certrelay-agent.service -n 30 --no-pager
```

约每 30 分钟检查一次，同步完成后退出。`installed` 表示新版本安装成功，`verified` 表示已安装版本验证成功；心跳成功只代表联通，不等于证书已安装。

## 证书保存在哪里？

### 主服务器：加密数据，不能直接填进 Nginx

默认生产目录：

```text
/var/lib/certrelay/master.key
/var/lib/certrelay/state.json
```

证书、私钥和 DNS 凭据加密在 state.json 中，不会额外自动生成 `/var/lib/certrelay/fullchain.pem`。源码开发默认用工作目录的 `data`，生产目录以 `server.env` 中 `CERTRELAY_DATA_DIR` 为准。

### 客户端：Nginx 实际使用的文件

生产签发成功、已授权、同步安装成功后，默认出现：

```text
/etc/certrelay-certs/example.com/current/fullchain.pem
/etc/certrelay-certs/example.com/current/privkey.pem
```

- fullchain.pem：证书及证书链。
- privkey.pem：证书私钥，不要公开内容。
- current：当前版本，续期后自动切换。不要固定引用 versions 下某个编号。
- example.com：申请时的根域名，不带 `*.`，不是单个业务子域名 `cpa.example.com`。
- 中文域名转换成 `xn--` 开头的 ASCII 目录名。

每台 `/etc/certrelay-agent/config.json` 的 `directoryRoot` 决定 managed 根目录；旧手工模式以 `certificates` 中的 `directory` 为准。不要只按默认示例修改现有 Nginx。

本地新版在**对应客户端**可查询路径，支持中文域名：

```bash
certrelay paths --domain example.com
```

配置在自定义位置：

```bash
certrelay paths --domain example.com --config /实际位置/config.json
```

只显示配置推导的路径，不显示证书或私钥内容；配置不存在会标注默认示例。输出路径不代表文件已安装。

## Nginx 填哪两个路径？

在使用证书的客户端服务器修改 Nginx HTTPS 站点配置，下面域名和根目录必须换成实际值：

```nginx
ssl_certificate /etc/certrelay-certs/example.com/current/fullchain.pem;
ssl_certificate_key /etc/certrelay-certs/example.com/current/privkey.pem;
```

先确认文件已安装，再检查和重载：

```bash
ls -l /etc/certrelay-certs/example.com/current/fullchain.pem
nginx -t
systemctl reload nginx
```

证书信息可这样看，不要 `cat privkey.pem`：

```bash
openssl x509 -in /etc/certrelay-certs/example.com/current/fullchain.pem \
  -noout -subject -dates
```

首次部署需要先准备可正常启动/重载的 HTTPS 引导站点，不要提前引用不存在的 current 文件导致 Nginx 无法启动。有旧证书时先保留它，安装和切换顺序需结合本机站点处理；新安装器不会自动完成这个引导。

## 常见现象

- 找不到证书目录：先查是否生产签发成功、已授权且同步成功；登记成功不够。
- results: []：通常没有已授权、已发布生产版本的证书可拉取。
- unconfigured：旧手工模式缺映射；managed 自动发现已授权证书，但不会自动授权。
- 心跳成功但安装 failed：检查本地 Nginx 检查/重载和 TLS 探测配置，不要通过重复登记解决。
- 客户端 service 显示 inactive：同步后退出是正常的；看 timer 是否 active 和最近执行结果。
- 改面板密码后能拉取吗：能，客户端令牌未变，只会使管理员会话失效。
- 每台都要保存 CF 密钥吗：不用。DNS 凭据只在主服务器；客户端仍必须持有证书私钥才能提供 HTTPS。

## 备份什么？

把实际数据目录的 master.key 与 state.json 作为一组加密备份，限制权限；不要提交代码、放公网下载目录或发到聊天。密码重置不能找回丢失的 master.key。客户端身份及配置也应按主机备份策略保护。
