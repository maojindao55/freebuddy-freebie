# 官网交互演示验收

日期：2026-10-07
分支：`codex/site-interactive-demos`
预览：`http://127.0.0.1:8796/#demo`

## 视觉依据与对比范围

以现有官网的字体、配色、品牌素材、页面节奏和演示窗口为视觉基线，新增任务面板、Agent 转接和评审修复场景。新增场景没有单独设计稿，结构参考桌面项目的 `ConversationTaskPanel` 和 `TransferDialog`，不将新增布局与原聊天场景的差异误判为像素偏差。

截图目录：
`/Users/hongbin9/.codex/visualizations/2026/10/06/01a11073-91c6-70e3-b1a9-9316a3430606/freebuddy-site-demo-build/`

- 来源：`source-desktop.png`、`source-mobile.png`，从 `https://freebuddy.si/` 捕获。
- 实现：`implementation-desktop.png`、`implementation-mobile.png`，从本地浏览器捕获。
- 同图并排对比：`comparison-desktop.png`、`comparison-mobile.png`。
- 清晰区域对比：`comparison-hero.png`，保留的标题、简介、下载入口和 Agent 素材。
- 新场景完整区域：`tasks-desktop.png`、`transfer-desktop.png`、`review-desktop.png`、`tasks-mobile.png`、`review-mobile.png`、`transfer-mobile-en.png`。

桌面来源和实现均为 1440 × 1000 CSS px / 1440 × 1000 图像像素；手机来源和实现均为 390 × 844 CSS px / 390 × 844 图像像素。截图密度为 1，没有拉伸或放大。区域截图按实际演示窗口尺寸裁切。另检查 768 × 1024 和 320 × 740 断点；临时视口在验收后重置。

来源中的原聊天动画与实现中的任务面板是有意改变的场景；上方营销内容在同语言、同视口、滚动位置 0 下单独比较。GitHub Star 和下载版本由外部数据决定，不作静态像素匹配要求。

## 必查表面

- 字体：沿用现有系统字体和 JetBrains Mono；标题层级、中文换行与原页一致。新增界面正文 12–13px，状态与说明低一级。
- 布局：沿用白色窗口、细边框、圆角和阴影；桌面任务卡片两列，手机一列。转接表单和长内容在演示内部滚动，页面没有横向溢出。
- 颜色：沿用绿色主色和灰色正文；待确认/评审问题使用琥珀色，运行中使用蓝色。新增主要按钮改用 `#047857`，保证小号白字对比度。
- 素材：复用仓库原有 FreeBuddy、Codex、Claude、Kimi、DeepSeek 图片；没有新增仿制 Logo 或占位插画。
- 文案：三个场景和控制栏均支持中英文；模拟数据明确标注，不连接真实 Agent。确认任务后文案、状态和筛选数量同步，复审通过前不显示最终交付通过。

## 对比迭代

1. 首轮发现桌面任务面板第二行卡片底部需要轻微滚动才能完整显示（P2）。收紧卡片内距、卡片间距和工具栏高度后，浏览器测得任务面板 `clientHeight = scrollHeight = 540`；最终 `tasks-desktop.png` 显示四张完整卡片。
2. 手机窗口首轮内容区为 520px，控制栏较容易落在首屏之外（P2）。调整为 460px，并保持说明、控制栏在窗口外部内容区；以 `tasks-mobile.png`、`review-mobile.png` 验证，所有操作可通过页面或内容区正常滚动到达。
3. 320px 英文页面发现原有导航溢出 4px、语言按钮换行、Agent 图标末端裁切（P2）。窄屏仅保留 Logo 图标、禁止语言按钮换行，并收紧 Agent 图标重叠间距。修复前后图为 `comparison-narrow-mobile.png`；修复后 `innerWidth = documentElement.scrollWidth = 320`。
4. 复查同图对比：桌面营销区域保持一致；手机营销区域保持一致，新增场景入口和内容为本次预期改动。没有残留可执行的 P0/P1/P2 问题。

## 交互与验证

- 任务面板：运行中、待处理和未读筛选；项目筛选；中英文搜索；无结果清空；打开卡片；读取未读结果；确认请求后继续。
- 转接：选择 Claude / Kimi；展开与收起摘要；确认创建接续会话；取消；Escape 取消；沿用工作目录。
- 评审：实现 → 首次评审发现问题 → 交回修复 → 重新评审 → 通过；可手动选择步骤。
- 控制：自动播放、手动暂停、前后步、重播、播放到末尾停止；人工操作后不会定时抢回控制；场景标签支持方向键 / Home / End。
- 对话：新会话、真实文本输入、选择 Agent、示例任务、发送模拟回复；团队执行入口可切换到评审场景；手机端可从标题栏新建会话。
- 浏览器控制台：没有捕获到脚本错误或警告。
- 自动验证：`npm test -- --test-reporter=spec`，99 / 99 通过；包括新增 6 个状态/计时器测试和资源发布规则检查。`git diff --check` 通过。
- 减少动态效果：代码默认遵循 `prefers-reduced-motion`，没有为测试修改用户的系统设置；系统级切换未单独模拟。

预览只服务白名单中的公开页面、样式、脚本和图片，不服务 Worker、仓库元数据或后端文件。验收文档通过 `.assetsignore` 排除在网站发布资源之外。

final result: passed
