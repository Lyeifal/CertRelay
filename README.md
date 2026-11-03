# CertRelay

[简体中文](README.md) · [English](README.en.md)

为个人多台服务器设计的轻量 SSL/TLS 证书管理与分发工具。

主服务器统一申请、续期和管理证书，客户端只领取被授权的证书。Cloudflare / 阿里云 DNS 凭据留在主服务器，不必在每台小服务器上维护一套申请脚本。

> 项目仍在早期阶段。核心协议已有自动化测试；全新 Linux 环境的安装器/systemd 端到端验收尚未完成，不应将它视为任意服务器上开箱即用的一键部署方案。

## 能做什么

- 通过 ACME DNS-01 申请 Let's Encrypt 证书，支持 Cloudflare 和阿里云 DNS。
- 一次申请包含根域名和一级通配符，例如 `example.com` 与 `*.example.com`。
- 主服务器按策略自动检查并提前续期，客户端定时拉取新版本。
- 为每台客户端设置独立证书授权，支持撤销身份。
- 使用有效期十分钟、成功只能使用一次的登记链接 + 验证码。
- 客户端安装后检查配置、重载 Nginx、验证本地 TLS；激活失败时尝试回滚。
- 提供中文 Web 面板，管理 DNS 凭据、证书、客户端和分发记录。
- 使用 Node.js 内置模块，无运行时 npm 依赖、数据库或 Docker 要求。

客户端按定时任务运行，同步后退出，适合小型 Linux 设备。512MB ARM 设备上的内存与兼容性尚未实测，不保证所有旧设备均可运行。

## 工作方式

```text
Cloudflare / 阿里云 DNS
          ↑ DNS-01 验证
CertRelay 主服务器：申请 → 续期 → 加密保存
          ↓ HTTPS，按客户端授权
CertRelay 客户端：拉取 → 安装 → 重载 Nginx → 验证
```

DNS 凭据只在主服务器保存；提供 HTTPS 的客户端仍须保存证书私钥。登记证明的是客户端持有有效令牌，不是不可克隆的硬件身份。

## 当前版本

截至 2026-11-03：

| 来源 | 版本 | 说明 |
| --- | --- | --- |
| 公共 npm | `0.3.0` | 已发布，包含服务端、客户端及安装命令 |
| 本仓库 | `0.3.1` | 开发版本，尚未发布 npm；新增统一密码与路径命令 |

GitHub 源码更新不会自动升级已部署服务器。不要通过重跑安装器覆盖现有生产配置。

## 安装前准备

- **Node.js 20 或更高版本**，以及 npm；请选择仍受支持且兼容系统/架构的版本。
- 生产签发、客户端安装以 **Linux + systemd** 为目标。
- 主服务器：域名、有效 HTTPS 入口、可访问 ACME/DNS API 的网络，以及可执行的 acme.sh 和它所需的 shell、curl、openssl 等工具。
- 客户端：可访问主服务器的 HTTPS，已准备好的 Nginx/业务站点及合适的检查、重载、TLS 探测配置。
- DNS 托管商的适当权限凭据。按域名实际 DNS 托管商选择，不按服务器厂商选择。

npm 包不包含 Node.js、Nginx、acme.sh，不会配置 DNS、业务反代或首次 HTTPS 引导。

## 安装与首次使用

### 1. 安装已发布的 CLI

```bash
npm install -g certrelay@0.3.0
certrelay --help
```

同一个包同时包含服务端和客户端；每台机器只运行需要的角色。生产服务安装需要 root 权限或 sudo。

安装器提供以下入口，先用 dry-run 查看计划：

```bash
certrelay install-server --public-url https://certs.example.com --dry-run
certrelay install-agent --dry-run
```

dry-run 不会安装或启动服务。实际安装前请阅读[安装说明](docs/INSTALL.md)，尤其是首次 HTTPS 引导和现有部署的边界。

### 2. 主服务器配置

1. 安装并启动服务，设置自己的管理员密码，准备面板 HTTPS。
2. 在“设置”填写 ACME 邮箱，在“DNS 凭据”添加 Cloudflare Token 或阿里云 AccessKey。
3. 在“域名证书”添加根域名，例如 `example.com`，启用自动续期。
4. 可以先用测试环境验证配置；正式分发须关闭测试环境并成功申请生产证书。
5. 在“客户端”创建邀请，选择允许该机器领取的证书。

### 3. 客户端登记与同步

在已经通过安装器准备好服务和配置的新客户端上执行：

```bash
certrelay-agent enroll --identity /etc/certrelay-agent/identity.json
```

按提示粘贴邀请链接、输入验证码。命令不会预置你的服务端地址；通信校验成功后保存地址和身份。已有客户端无需重复登记。

如果安装和登记是分开进行的，还需启用定时器：

```bash
systemctl enable --now certrelay-agent.timer
systemctl start certrelay-agent.service
journalctl -u certrelay-agent.service -n 30 --no-pager
```

确认生产签发成功、授权正确，且客户端出现 `installed` 或 `verified` 回执。在线只代表联通，不代表证书已经安装。

### 4. 让 Nginx 使用证书

同步成功后，默认文件位置是：

```text
/etc/certrelay-certs/example.com/current/fullchain.pem
/etc/certrelay-certs/example.com/current/privkey.pem
```

其中 `example.com` 是申请时的根域名，不带 `*.`。中文域名使用 `xn--` ASCII 形式。自定义路径以客户端 `/etc/certrelay-agent/config.json` 为准。

Nginx 配置：

```nginx
ssl_certificate /etc/certrelay-certs/example.com/current/fullchain.pem;
ssl_certificate_key /etc/certrelay-certs/example.com/current/privkey.pem;
```

首次安装有 HTTPS 引导问题：不要提前引用不存在的文件导致 Nginx 启动失败。需结合本机旧证书或引导站点完成首次安装和切换；安装器不会替你处理业务站点。

首次验证成功后，续期与拉取可以自动完成，Nginx 保持引用相同的 `current` 路径。新增域名仍需添加证书、授权客户端，并配置相应站点。

## 面板密码与密钥

面板密码由你自己设置，长度 **14–1024 个字符**，不要求随机符号。客户端令牌、DNS 密钥、证书私钥都不是面板密码，不需要日常手输，也不应为了好记而改短。

- 记得密码：面板“设置 → 修改管理员密码”。
- 忘记密码：在主服务器终端停服、重置、再启动。
- 改密码不会更换证书、DNS 凭据或客户端身份。

本仓库 0.3.1 安装为 CLI 后可用（npm 0.3.0 暂无这些统一子命令）：

```bash
systemctl stop certrelay
certrelay reset-password --data-dir /var/lib/certrelay
systemctl start certrelay
```

npm 0.3.0 已有独立入口 `certrelay-init`、`certrelay-reset-password`。旧版需显式指定正确数据目录，并以服务用户运行；具体步骤见[小白使用指南](docs/BEGINNER.md)。

0.3.1 还可在对应客户端查询路径：

```bash
certrelay paths --domain example.com
```

该命令只显示配置推导的路径，不显示私钥，也不代表文件已安装。

## 安全与维护

- 主服务器将证书、DNS 凭据等加密保存在状态文件；默认生产目录为 `/var/lib/certrelay`，源码开发默认是 `./data`。
- `master.key` 与 `state.json` 必须一起加密备份。重置面板密码不能找回丢失的主密钥。
- 妥善保护客户端 `identity.json` 和证书私钥；不要提交到 Git 或暴露在 Web 目录。
- 生产只使用 HTTPS，不关闭证书校验；建议为 DNS 凭据授予满足申请需求的最小权限。
- 客户端默认约每 30 分钟检查一次；并非实时推送，也不是等证书过期才拉取。
- DNS/API 故障、凭据失效、磁盘或 Nginx 错误仍需处理。自动续期不等于无需备份、巡检或故障处理。

## 从源码运行与测试

下面仅用于本机开发，不是生产部署步骤。没有运行时依赖，无须先执行 `npm install`：

```bash
git clone https://github.com/Lyeifal/CertRelay.git
cd CertRelay
export CERTRELAY_DATA_DIR="$PWD/data"
export CERTRELAY_PUBLIC_URL="http://127.0.0.1:4173"
export CERTRELAY_ALLOW_LOCAL_HTTP=1
node scripts/certrelay.mjs init-admin
npm start
```

访问 `http://127.0.0.1:4173`。开发数据必须与生产数据隔离；真实 ACME 签发仍需 Linux 及外部工具。

```bash
npm run check
npm test
```

可选真实 API + DOM 测试：`npm run verify:live-ui`，需额外准备 jsdom，或通过 `JSDOM_MODULE` 指定其入口。测试使用临时数据，不连接真实 DNS 账户。

旧原型 `npm run preview` 没有生产鉴权，不可暴露到公网。测试通过不代表全部 Linux 首装、真实公网 ACME 或所有 ARM 设备已经验收。

## 自动发布 npm

仓库提供 `.github/workflows/publish.yml`：发布稳定版 GitHub Release 后，先校验版本与运行测试，再通过 npm Trusted Publishing 发布。普通 push 不会发布，也不需要保存长期 npm Token。

首次需在 GitHub 创建 `npm` 环境，并在 npm 包设置中配置可信发布者：用户 `Lyeifal`、仓库 `CertRelay`、工作流 `publish.yml`、环境 `npm`，允许 `npm publish`。详细步骤见[自动发布说明](docs/PUBLISHING.md)。配置文件本身不代表已成功完成首次自动发布，也不会自动升级线上服务器。

## 更多文档

- [小白使用指南](docs/BEGINNER.md)：密码、证书路径、登记、Nginx 和排障。
- [安装说明](docs/INSTALL.md)：运行环境、版本差异与安装器限制。
- [客户端登记协议](docs/ENROLLMENT.md)：一次性邀请、令牌与身份边界。
- [文档索引](docs/README.md)。

公开仓库不包含个人服务器运维记录、凭据、运行状态、部署备份或诊断数据。
