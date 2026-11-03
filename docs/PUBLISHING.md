# 自动发布 npm

[中文 README](../README.md) · [English README](../README.en.md)

已完成的发布记录、升级边界及已知问题见 [v0.3.1 发布说明](RELEASE-v0.3.1.md)。本页是后续发布操作指南。

工作流：`.github/workflows/publish.yml`。采用 npm Trusted Publishing / GitHub OIDC，不需要配置长期 npm Token。本配置依据 2026-11-03 的官方要求：Node.js >= 22.14.0、npm >= 11.5.1、GitHub 托管 runner；实际使用 Node.js 24 与固定 npm 11.21.1。

工作流显式启用 provenance，用于当前公开仓库和公开 npm 包；若以后把仓库改为私有，需重新评估该配置，npm 不支持私有仓库的 provenance。

## 一次性配置

### 1. GitHub 发布环境

在 `Lyeifal/CertRelay` 仓库的 **Settings → Environments → New environment** 创建 `npm`。

这是发布环境的名字，不是服务器域名、npm 用户名、环境变量或密钥。它用于关联发布保护规则：例如要求指定人员批准后才能发布，或者限制允许发布的分支/标签。

个人项目可以先不设置人工审批。仅命名 `npm` 不会自动开启审批，也不需要填任何 environment secrets。以后多人维护时，再设置 Required reviewers。单人项目若启用了 Prevent self-review，自己发起的任务可能无法由自己批准，需谨慎设置。

当前工作流从 Release 的标签运行；如配置环境的 Deployment branches and tags 限制，请允许对应的 `v*` 标签，不能只允许 main 分支。

### 2. npm 可信发布者

打开 npm 的 `certrelay` 包设置，在 **Trusted Publisher** 中选择 GitHub Actions，填写：

| 字段 | 值 |
| --- | --- |
| Organization or user | `Lyeifal` |
| Repository | `CertRelay` |
| Workflow filename | `publish.yml` |
| Environment name | `npm` |
| Allowed actions（若显示） | 允许直接发布的 `npm publish` |

Workflow filename 只填文件名，不填 `.github/workflows/`。字段按上述拼写填写；仓库和 package.json 中的 repository.url 必须匹配。

**Environment name 在 npm 本身是可选项，但这份工作流使用 `environment: npm`，所以这里也填 `npm`。** 如果要完全不用 environment，需要同时移除工作流的 environment 配置并清空 npm 中的相应字段。

较新的可信发布者配置可能默认只允许 `npm stage publish`；本项目采用直接 `npm publish`，必须允许该操作。不需要允许管理 dist-tags，也不需要新增 `NPM_TOKEN` 或调用 `npm login`。npm 保存配置时不会实际验证，OIDC 授权仍需在第一次真实发布时确认。

注意：按当前 npm 规则，新建可信发布者后须在两天内完成第一次成功发布，否则该配置会过期；过期后需删除并重新创建。不要为了赶这个期限发布未准备好的版本。

## 每次发布

1. 确定一个尚未发布的稳定版本，更新 package.json 的 version。0.3.1 已成功发布，后续发布必须使用新版本，不能重复发布 0.3.1。
2. 更新版本相关文档，运行 `npm run check` 和 `npm test`。
3. 提交代码，推送到 GitHub。普通 push 不会发布。
4. 在 GitHub **Releases → Draft a new release** 创建标签，例如 `v0.3.1`，目标选包含本工作流和待发布代码的提交。
5. 填写发布说明，不勾选预发布，点击 **Publish release**。
6. 在 **Actions → Publish to npm** 查看结果；如环境要求审批，批准后才会进入发布步骤。

工作流校验标签与版本一致，执行语法检查、自动化测试和打包预览；全部成功后，独立发布 job 使用同一提交，通过 OIDC 发布并附带 provenance。测试 job 没有 npm 发布所需的 id-token 写权限；只有发布 job 拥有该权限并受 npm 环境规则控制。

## 什么不会触发发布

- 普通代码提交或推送 main。
- 只创建/推送标签，没有发布 GitHub Release。
- 保存 Release 草稿。
- 标记为 prerelease 的发布。

本工作流只用于稳定版；不能用它自动发布 beta。修改工作流或创建它本身也不会发布 npm。Release 所指提交必须包含工作流，不能指向添加工作流之前的旧提交。

## 常见错误

- **403 / trusted publisher mismatch**：核对用户、仓库、workflow 文件名、环境名和允许的 npm 操作；不以 `npm whoami` 的成败作为 OIDC 权限判断。
- **标签不一致**：`v0.3.1` 必须对应 package.json 中的 `0.3.1`。
- **版本已存在**：npm 不允许覆盖已发布版本。若上一次发布成功但后续失败，不要盲目重跑；先核对 npm 再决定是否需要新版本。
- **等待审批/环境规则拒绝**：到 GitHub 的 npm 环境检查审核者及标签规则。环境名本身不会自动提供审批保护。
- **测试失败**：发布 job 不会运行；修复代码、确定正确版本和提交，再创建合适的 Release，不要跳过测试。

2026-11-03 已完成第一次真实发布：Release v0.3.1 对应提交 `fd12c54bb0ab393de66873becddcf1b5b912f94e`，Actions run `41613994489` 的测试与发布 job 均成功；npm latest 已指向 0.3.1，并生成 provenance。公共包已在独立临时目录安装，统一密码重置、路径查询和客户端 CLI 帮助入口检查通过。

当时 GitHub 的 npm 环境未设置额外审批保护规则，因此本次成功不代表人工审批规则已验收。发布没有使用长期 npm Token，也没有升级生产服务器。本节之后的文档提交不会改动 v0.3.1 标签或再次触发发布。

## 官方参考

- npm：`https://docs.npmjs.com/trusted-publishers/`
- GitHub：`https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments`
