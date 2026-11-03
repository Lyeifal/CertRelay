# CertRelay 文档

[简体中文 README](../README.md) · [English README](../README.en.md)

建议按以下顺序阅读：

1. [小白使用指南](BEGINNER.md)：区分主服务器/客户端、密码与密钥，了解证书位置和首次操作。
2. [安装说明](INSTALL.md)：系统要求、npm 安装、服务配置和当前安装器限制。
3. [客户端登记协议](ENROLLMENT.md)：邀请有效期、一次性校验、长期令牌和安全边界。
4. [自动发布 npm](PUBLISHING.md)：配置可信发布者、npm 环境和 GitHub Release 发布流程。
5. [v0.3.1 发布说明](RELEASE-v0.3.1.md)：实际发布结果、版本变化、升级边界、验收和已知问题。

截至 2026-11-03：公共 npm 已自动发布 0.3.1，latest 指向 0.3.1，包含统一的 init-admin、reset-password、paths 子命令。首次 GitHub Actions / OIDC 发布、公共包干净安装检查及既有一台服务端/两台客户端升级验证已完成；全新 Linux/systemd 首装和 512MB ARM 设备仍未验收。

支持文档目前以中文为主，英文总览见 English README。示例使用 example.com，请替换成实际域名、路径和服务设置。

个人服务器清单、运行记录、诊断、凭据和备份不属于公开文档，保留在本地忽略目录中。历史记录不能代替实时状态核验。
