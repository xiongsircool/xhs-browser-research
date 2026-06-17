# xhs-browser-research

一个用于 Codex 的小红书浏览器检索 Skill。它通过真实登录的浏览器会话访问小红书，支持搜索、意图筛选、结果卡片查看、详情弹窗慢速检查、广告/骗子风险初筛，以及 HTML 报告输出。

这个项目不依赖旧的 `xiaohongshu-mcp`。推荐底层使用 Microsoft Playwright MCP，也可以在当前 Codex 会话里用附带的临时 controller 做实验。

## 适用场景

- 在小红书搜索某类人、账号、内容或笔记。
- 根据用户意图自动配置筛选条件。
- 对交友/找对象类内容做广告、红娘、中介、引流、诈骗风险初筛。
- 慢速打开笔记详情弹窗，抽取正文、图片、评论和互动信息。
- 输出带 URL、图片、摘要、风险点和推荐理由的 HTML 报告。

## 设计原则

- 使用真实登录态浏览器，不使用旧的小红书 MCP。
- 复用同一个浏览器页面，不频繁重启、刷新、多开。
- 结果详情通过点击卡片打开弹窗，不直接打开多个详情 URL。
- 慢速串行处理，每一步等页面稳定后再继续。
- 不声称能验证真人身份，只做基于公开页面信息的风险初筛。

## 安装 Skill

把 `xhs-browser-research` 目录复制到 Codex skills 目录：

```bash
mkdir -p ~/.codex/skills
cp -R xhs-browser-research ~/.codex/skills/
```

也可以运行：

```bash
bash scripts/install-skill.sh
```

## Playwright MCP 配置

在 `~/.codex/config.toml` 中添加：

```toml
[mcp_servers.playwright]
command = "npx"
args = ["-y", "@playwright/mcp@latest", "--browser", "chrome", "--user-data-dir", "/Users/Apple/.codex/browser-mcp/xhs-profile", "--output-dir", "/Users/Apple/.codex/browser-mcp/output", "--caps", "vision", "--viewport-size", "1280x900", "--timeout-action", "8000", "--timeout-navigation", "30000", "--shared-browser-context"]
```

并创建目录：

```bash
mkdir -p ~/.codex/browser-mcp/xhs-profile ~/.codex/browser-mcp/output
```

修改 MCP 配置后通常需要重启 Codex 或开启新会话，才能看到 Playwright MCP 工具。

## 示例提示词

```text
用 xhs-browser-research 帮我在小红书找适合我朋友的男生候选。她偏好帅、智商高、表达真诚、有稳定职业或高学历的人。上海同城优先。请自动识别检索意图并配置筛选，优先最新、一周内、同城；慢速打开结果详情弹窗检查正文和评论，排除中介、红娘、引流私信、加微信、收费、模板号、信息过少或疑似骗子的内容。最后输出一个 HTML 报告，保留 5-10 个候选，每个候选带 URL、图片、可见个人信息、摘要、风险点和推荐理由。
```

## 交友意图默认筛选

当用户输入包含 `男找女`、`女找男`、`找对象`、`交友`、`脱单`、`相亲`、`搭子` 等意图时：

- 地点：如果用户提供地点，把地点合入关键词，例如 `上海男找女`。
- 排序：最新。
- 时间：一周内；如果用户强调“最近/现在/活跃”，用一天内。
- 距离：同城。
- 类型：不限。

## 风险初筛规则

高风险信号：

- 加微信、VX、二维码、私信、进群、下载 App。
- 红娘、月老、中介、撮合、收费、付费服务。
- 投资、理财、资源售卖。
- 信息极少、模板化、异常标题、疑似规避平台规则。
- 评论区出现质疑或负面提醒。

正向信号：

- 年龄、城市、区域、职业、学历、生活习惯、择偶意图具体。
- 主页历史内容像真实个人生活。
- 评论区互动自然。

## 仓库结构

```text
.
├── README.md
├── config.example.toml
├── scripts/
│   └── install-skill.sh
└── xhs-browser-research/
    ├── SKILL.md
    ├── references/
    │   └── xhs-browser-notes.md
    └── scripts/
        └── xhs-controller.js
```

## 注意事项

- 本项目只是辅助检索和初筛，不提供身份真实性保证。
- 不要自动点赞、评论、私信、关注或发布内容，除非用户明确要求并在动作前确认。
- 不要绕过验证码、安全校验或平台限制。
- 不要把报告中的候选当成“可信人选”，实际联系前仍需人工核验。
