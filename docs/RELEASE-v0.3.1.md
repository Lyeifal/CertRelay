# CertRelay v0.3.1 发布说明

[简体中文 README](../README.md) · [English README](../README.en.md) · [发布操作指南](PUBLISHING.md)

## 发布结果

2026-11-03 已发布稳定版 `v0.3.1`，公共 npm 包为 `certrelay@0.3.1`。本页记录这次版本的实际发布与验收；下一次如何发布，请阅读[发布操作指南](PUBLISHING.md)。

| 项目 | 本次记录 |
| --- | --- |
| GitHub 仓库 | `Lyeifal/CertRelay` |
| Release / 标签 | `v0.3.1`（非 prerelease） |
| 发布源码提交 | `fd12c54bb0ab393de66873becddcf1b5b912f94e` |
| GitHub Actions run | `41613994489`，校验与发布 job 均成功 |
| npm 包 / dist-tag | `certrelay@0.3.1` / 发布验收时 `latest=0.3.1` |
| 认证方式 | npm Trusted Publishing，GitHub OIDC，环境 `npm` |
| 来源证明 | 随 npm 发布生成 provenance |

本次未使用长期 npm Token。发布时 `npm` 环境没有额外人工审批规则，因此不代表人工审批流程已经验收。发布后的文档提交不会改变已有标签或 npm 包。

## 这一版有什么

- 统一 CLI 增加 `certrelay init-admin`、`certrelay reset-password`、`certrelay paths`。
- 管理员可以自设长口令；交互终端隐藏输入并确认两次。重置前检查数据目录和运行锁，避免误建新密钥。
- 新增中英文 README、小白指南和证书路径说明。
- 使用稳定版 GitHub Release 触发检查、测试和 npm 自动发布。
- 保留集中 DNS-01 签发、自动续期、一次性登记邀请、按客户端授权分发、Nginx 重载与 TLS 验证等已有能力。

同一个 npm 包包含服务端和客户端，没有运行时 npm 依赖；并不是两个需要分别购买或安装的包。

## 新用户安装

先准备兼容系统/架构的 Node.js（包声明 `>=20`）和 npm，再安装 CLI：

```bash
npm install -g certrelay@0.3.1
certrelay --help
certrelay install-server --public-url https://certs.example.com --dry-run
certrelay install-agent --dry-run
```

以上两条 dry-run 仅预览计划。不要在同一台机器上盲目执行两个角色的实际安装，也不要将 CLI 安装成功等同于证书服务已经部署好。

安装器不负责 Node.js、Nginx、acme.sh、业务站点、DNS 或首次 HTTPS 引导。正式操作按[安装说明](INSTALL.md)与[小白指南](BEGINNER.md)完成。新客户端需要登记和授权；已有客户端不需要重新登记。

## 已有服务器升级

GitHub Release 和 npm 自动发布都不会自动升级服务器。

`npm install -g certrelay@0.3.1` 更新的是全局 CLI；如果 systemd 的 `ExecStart` 指向 `/opt/...` 中的独立应用目录，该服务不会因此更新。

升级前核对实际 unit、应用目录、Node 路径、数据目录和客户端配置；备份应用、unit、配置及身份。服务端的 `master.key` 和 `state.json` 必须作为同一恢复单元安全备份，复制状态文件前需保证一致性。备份含秘密，不要上传公开仓库。

停止相关任务，在维护窗口用校验过的发布包替换应用文件，保留 Node 运行时、环境文件、状态和身份，然后恢复原服务及定时器。不要重跑 `install-server` / `install-agent`、初始化管理员、清空状态或重新登记来实现升级。应用回退与状态恢复是不同操作，不要用旧状态覆盖升级后的新写入。

2026-11-03 已在一台既有 Linux 服务端（兼本机客户端）和两台既有 Linux 客户端完成原路径升级：每台 35 个发布文件与 npm 包逐一匹配，配置和身份未变化，服务端主密钥及受保护配置摘要未变化，三台同步均验证现有生产证书。此次未重新签发证书、修改 DNS 凭据、轮换密码或升级其他业务。

个人主机地址、路径差异和备份位置仅记录在私有运维档案，不属于本发布说明。

## 验收与边界

- 发布工作流的语法检查、协议与安全测试、客户端安装回滚测试、ACME 隔离测试和管理员 CLI 测试通过。
- 公共 npm 包在独立目录完成干净安装，CLI 帮助及密码/路径命令入口通过检查。
- 既有三机升级后，服务与定时器正常；证书文件、源站 TLS 和公网入口通过检查。
- 这不是全新 Linux/systemd 首装验收；512MB ARM 设备的内存、性能和旧系统兼容性仍未实测。
- 本次同步使用已有有效生产证书，不代表对未来真实续期、全部 DNS 供应商和全部设备的完整验收。

## 已知问题

1. **健康接口版本文字不准确**：本版 `/api/v1/health` 仍硬编码返回 `0.2.0`。判断实际版本应核对运行应用目录中的 `package.json` 与发布文件，而不是仅看健康接口。该问题待后续补丁处理；不能覆盖已经发布的 `0.3.1`。
2. **路径查询不代表文件存在**：`certrelay paths` 只推导路径。客户端专用主机没有服务端配置时，显示的服务端目录可能回退到当前目录下的 `data`，并不表示本机部署了服务端。实际证书路径以客户端配置和同步结果为准。
3. **文档与包是各自的快照**：npm `0.3.1` 保留发布时文档，可能含当时的“尚未发布/尚未升级”说明；GitHub 主分支上的后续文档更新不会回写到旧包。

## 下一次发布速查

1. 修改代码与文档，将 `package.json` 更新为未发布的新版本，例如 `0.3.2`。
2. 运行 `npm run check`、`npm test`，检查 `npm pack --dry-run`，确认没有秘密或个人运维资料。
3. 提交并推送，创建指向该提交的稳定版 Release；标签必须与包版本一致，例如 `v0.3.2`。
4. 查看 Actions 的校验和发布结果，再核对 npm 包、版本和来源证明。
5. 需要升级服务器时，另行安排备份、部署和验收；不要重复发布 `0.3.1`，不要移动已发布标签。

普通 push、只有标签、草稿或 prerelease 均不会触发当前稳定版发布工作流。完整配置与排障见[自动发布 npm](PUBLISHING.md)。

## English summary

CertRelay **v0.3.1** was published on November 3, 2026 through GitHub Actions using npm Trusted Publishing (OIDC, environment `npm`) with provenance. Release commit: `fd12c54bb0ab393de66873becddcf1b5b912f94e`; successful workflow run: `41613994489`.

Install the CLI with `npm install -g certrelay@0.3.1`. This version adds unified administrator initialization, password reset, and certificate-path commands, plus improved onboarding documentation. Installing the global CLI does not upgrade a separately deployed systemd application.

An existing Linux server and two existing Linux agents were upgraded and verified without replacing configuration, identities, or server secrets. Fresh Linux installation and 512MB ARM resource use remain unvalidated. The health endpoint incorrectly reports `0.2.0`; check the deployed package and files instead. Published versions and tags must not be overwritten.
