# 贡献指南 / 提交 PR

本项目欢迎大家爆料免费模型与额度！

> 投稿/更新一律以 GitHub PR 为准；页面没有在线投稿表单。

有两条互不影响的路可以走，**按你的目的挑一条即可**：

| 你想改什么 | 改哪里 | 合并后会发生什么 |
| --- | --- | --- |
| 页面上的服务商卡片（静态目录） | `providers.json` | 重新部署静态站点，页面直接更新 |
| 运行时目录 `GET /api/providers`（D1） | `submissions/providers/<id>.json` | workflow 自动把声明同步进 D1；新增用 `"status": "approved"`，下线改成 `"status": "disabled"`，恢复改回 `"approved"` |

> `submissions/providers/` 的完整规范（字段表、下线/恢复步骤、删除文件的策略、本地自检命令）见 👉 [submissions/providers/README.md](./submissions/providers/README.md)，可直接复制的示例在 `submissions/examples/`。
> 静态目录 `providers.json` 与运行时目录按 `id` 合并、静态条目优先；`submissions/` 只做增量补充，不会改动或删除 `providers.json` 里的条目。

- **🤖 推荐方式（让 AI Agent 帮你提 PR）**：
  直接将你要爆料的服务商信息以及下方的规则提示发给你的 AI 助手（Cursor, Claude Code, GitHub Copilot 等）：

  ```text
  我要爆料/更新免费服务商信息：[粘贴官网链接、模型名或活动内容]
  规则与规范请直接读取：https://github.com/maojindao55/freebuddy-freebie/blob/main/CONTRIBUTING_AGENT.md
  请按规则修改 providers.json 并帮我向 maojindao55/freebuddy-freebie 提交 Pull Request。
  ```

- **✍️ 人工网页端快速提交**：
  直接在 GitHub 上点击 [providers.json](https://github.com/maojindao55/freebuddy-freebie/blob/main/providers.json) 的编辑按钮（🖊），添加或修改服务商信息，并创建 Pull Request。字段规范请参考 [CONTRIBUTING_AGENT.md](./CONTRIBUTING_AGENT.md)。
  需要同时下发到运行时目录时，再新增一个 `submissions/providers/<id>.json`（`<id>` 与 `id` 字段必须一致）。

- **📣 只想下线某个服务商**：在 `submissions/providers/<id>.json` 里把 `status` 改成 `"disabled"`，并补上必填的 `offlineReason` 与 `offlineAt`（`YYYY-MM-DD`），其余字段原样保留，提 PR 合并即可 —— 记录不会从 D1 删除，之后改回 `"approved"` 就能恢复。

- **💬 进群直接交流/爆料**：
  如果你不想走 GitHub，也可以直接加入群聊告诉我们：  
  👉 [点击链接加入群聊【FreeBuddy白嫖兄弟群】](https://qm.qq.com/q/Obv3kViheo)
