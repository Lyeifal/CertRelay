# CertRelay 安装说明

[项目介绍](../README.md) · [English README](../README.en.md) · [小白使用指南](BEGINNER.md)

## 状态与适用范围

截至 2026-11-03，公共 npm 已发布 0.3.1，latest 指向 0.3.1。首次 GitHub Actions/OIDC 发布及公共包干净安装检查已通过，生产服务器没有自动升级。

安装器通过本地语法、dry-run 和打包入口测试，但尚未完成全新 Linux/systemd 环境端到端验收。以下是安装流程说明，不是保证任意机器一次成功的部署承诺。已有生产部署不要重跑安装器或使用 `--force` 来更新。

## 安装前准备

- Node.js >= 20、npm；选择仍受支持且兼容本机系统/架构的版本。
- Linux、systemd，以及 root/sudo 权限。
- 主服务器：域名、对外有效 HTTPS、acme.sh、所需 shell/curl/openssl 工具和可访问 ACME/DNS API 的网络。
- 客户端：Nginx 或合适的本地检查/重载命令、业务站点、TLS 探测配置。
- DNS 凭据在面板填写，不复制到客户端，不写入 unit 或 Git。

npm 包没有运行时依赖，但不包含这些系统组件。安装器会使用执行时的 Node.js 绝对路径；Node.js 和 acme.sh 必须能被服务用户执行，不要放在被 `ProtectHome=true` 隔离的私人主目录下。

## 安装 CLI

以下按 root 终端书写：

```bash
npm install -g certrelay@0.3.1
certrelay --help
```

也可在已克隆的源码目录中 `npm install -g .` 安装本仓库源码版；这只安装 CLI，不会自动升级独立复制到 /opt 下的服务。

## 主服务器

先查看计划，不写系统：

```bash
certrelay install-server --public-url https://certs.example.com --dry-run
```

确认外部依赖后，可执行安装器：

```bash
certrelay install-server --public-url https://certs.example.com
systemctl stop certrelay
sudo -u certrelay env CERTRELAY_DATA_DIR=/var/lib/certrelay certrelay-init
systemctl start certrelay
```

首次设置密码至少 14 个字符，自己输入；旧版隐藏输入不会显示字符。首次启动尚未初始化管理员时可能失败，停服、初始化、再启动，不要删除数据文件。

安装器创建 certrelay 系统用户，并默认使用：

| 内容 | 位置 |
| --- | --- |
| 应用副本 | /opt/certrelay/current |
| 服务环境变量 | /etc/certrelay/server.env |
| 数据目录 | /var/lib/certrelay |
| 服务 | certrelay.service |
| 本地监听 | 127.0.0.1:4173 |

面板需要有效 HTTPS 反代。首次 HTTPS 引导证书需另行准备，不能依赖尚不可达的面板完成自身首次登记。业务站点配置可参考 `deploy/nginx.example.conf`，必须按实际域名、路径调整。

可选参数：

- `--data-dir PATH`：绝对数据目录。
- `--acme-path PATH`：acme.sh 绝对路径，默认 /opt/acme.sh/acme.sh。
- `--port NUMBER`：服务端本地监听端口。
- `--dry-run`：只显示安装计划。
- `--force`：覆盖生成的环境、应用和 unit；可能影响原部署，不能作为通用升级步骤。

## 客户端

以下只用于已准备好 Node.js、Nginx 和首次 HTTPS 站点的新机器：

```bash
certrelay install-agent --dry-run
certrelay install-agent
certrelay-agent enroll --identity /etc/certrelay-agent/identity.json
systemctl enable --now certrelay-agent.timer
systemctl start certrelay-agent.service
journalctl -u certrelay-agent.service -n 30 --no-pager
```

按提示粘贴邀请链接、输入验证码。已有身份不会被登记命令静默覆盖。也可以通过 `install-agent --link URL` 安装并交互登记；成功时安装器启用定时器。

默认 managed 模式自动发现服务端授权且已发布的证书，不会自动取得未授权域名。客户端本地配置仍然存在：

| 内容 | 位置 |
| --- | --- |
| 应用副本 | /opt/certrelay-agent/current |
| 配置 | /etc/certrelay-agent/config.json |
| 身份 | /etc/certrelay-agent/identity.json |
| 证书根目录 | /etc/certrelay-certs |
| 同步任务 | certrelay-agent.service |
| 定时器 | certrelay-agent.timer |

客户端默认使用 `/usr/sbin/nginx -t` 检查、systemctl 重载 Nginx，并探测本机 HTTPS。根据实际环境修改 config.json；`--directory-root`、`--servername`、`--verify-port` 可调整初始值。

第一次同步需要能正常检查、重载的站点。不要提前让 Nginx 引用尚不存在的 current 文件。已有证书先保留，结合引导站点完成第一次同步和切换；安装器不会替你配置业务反代。

## 0.3.1 命令差异

0.3.1 新增以下子命令，旧版 npm 0.3.0 不包含：

```bash
certrelay init-admin --data-dir /var/lib/certrelay
certrelay reset-password --data-dir /var/lib/certrelay
certrelay paths --domain example.com
```

设置/重置密码前先停止服务，完成后启动。目录不对或仍被锁定时拒绝操作，不更换 master.key。旧独立入口继续兼容。

## 资源与安全

应用没有运行时 npm 依赖，但 Node.js 自身需要额外磁盘和内存。安装器设置服务端 MemoryMax=384M、客户端 MemoryMax=128M，这是限制，不是实测用量；512MB ARM 设备尚未验收。

备份主服务器的 master.key + state.json，以及客户端配置/身份。不要把密码、验证码或令牌放进命令行；交互登记使用隐藏输入。生产证书和私钥仅在成功签发、授权及同步后安装，测试证书不会被安装。
