# 官网功能卡片验收

日期：2026-10-07
分支：`codex/site-interactive-demos`
预览：`http://127.0.0.1:8796/#feature-tasks`

## 本次调整

撤回顶部任务面板 / 转接 / 评审 Tab 的改造，恢复 `13bf8b9` 的原有主交互动画。在原有四个功能卡片后新增 05 任务面板、06 Agent 转接、07 评审修复，沿用左右交错布局、窗口外观和品牌素材。新增交互由独立的 `feature-demos.js` 和 `feature-demos.css` 实现。

## 原动画恢复检查

- `main.js` 与 `13bf8b9` 完全相同。
- `styles.css` 与 `13bf8b9` 完全相同。
- `index.html` 的整个 Hero section 与 `13bf8b9` 完全相同。
- 删除前一版顶部演示的 `demo.js`、`demo-state.js` 和对应测试；原主动画、设置演示、新会话与 Agent 选择过程均使用原代码。

## 视觉验收

截图目录：
`/Users/hongbin9/.codex/visualizations/2026/10/06/01a11073-91c6-70e3-b1a9-9316a3430606/freebuddy-site-feature-cards/`

- `restored-hero.png`：恢复后的顶部原动画。
- `tasks-desktop.png`、`handoff-desktop.png`、`review-desktop.png`：1440 × 1000 视口下的三个新增功能区。
- `review-mobile-en.png`、`handoff-mobile-en.png`：390 × 844 英文手机布局。
- `tasks-mobile-320.png`：320 × 740 中文窄屏布局。
- `feature-cards-overview.png`：三个桌面卡片的完整区域，便于整体核对。

逐张检查新增卡片，沿用原字体、配色、圆角、阴影和 Agent 图标。正文和按钮无截断，长摘要可完整显示。390px 下三个卡片的 `clientWidth = scrollWidth = 346`；320px 下均为 276，无卡片横向溢出。临时视口在交付前重置。

## 交互验收

- 三个卡片分别在可见比例达到 35% 后自动播放，离开可见区域或浏览器隐藏时停止计时。
- 手动筛选、点击任务、选择转接 Agent 或选择评审步骤，会接管该卡片；点击播放或重播恢复演示。
- 任务面板：运行中筛出 2 个任务、未读筛出 1 个任务；确认签名请求后，运行中变为 3、待处理变为 0。
- 转接：选择 Kimi、展开目标 / 进度 / 下一步摘要、确认转接，接续会话显示 Kimi 和原工作目录。
- 评审：依次检查实现完成、首次发现问题、修复、重新评审、评审通过五个状态。
- 中英文切换同步卡片标题、说明、按钮、状态与摘要。
- 遵循减少动态效果设置，自动播放停用，静态内容仍可通过按钮操作；未更改用户系统设置。
- 最终加载没有新增脚本错误。过程中的变量名冲突已通过独立作用域修复。
- `interaction-evidence.json` 保存实际浏览器操作与自动播放记录。

## 工程检查

`npm test -- --test-reporter=spec`：93 / 93 通过。恢复原主动画代码的比对通过；新脚本语法检查和 `git diff --check` 通过。公开资源检查覆盖 `feature-demos.js` 与 `feature-demos.css`，验收文档不发布到官网。

本地预览仅提供公开 HTML、CSS、JS 和图片白名单，不服务 Worker 或后端文件。

final result: passed
