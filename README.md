# ZCode Pin / ZCode 上下文固定插件

> 🔗 **广告**：[sharellm.net](https://sharellm.net/sign-up?aff=wb5b) — AI 模型共享平台，海量模型一键体验（注册邀请链接）

[English](#english) · [中文](#中文)

![Version](https://img.shields.io/badge/version-1.0.0-blue) ![License](https://img.shields.io/badge/license-MIT-green)

给 [ZCode](https://zcode.z.ai) 桌面端加上「Pin」：把关键约束**钉住**，每一轮对话都自动注入到模型上下文的最顶部（最高注意力权重位置）——长对话不遗忘、上下文压缩不丢失。三种钉住方式（手动输入 / 消息悬停 / 选区），最多 3 条/会话，支持编辑、暂停、加强注入、过时询问解除，全部内置在 ZCode 进程内。

Give the [ZCode](https://zcode.z.ai) desktop app "sticky context pins": pin a key constraint once and it is re-injected at the very top of every request (primacy position) — long conversations no longer forget it, context compaction cannot lose it. Three ways to pin (manual text / hover a message / select text in the native toolbar), up to 3 pins per conversation, with edit / pause / boost / stale-detect-ask, all inside ZCode's own process.

---

## 📌 版本对应表 / Version Matrix

**打补丁前请先核对你的 ZCode 版本！**

| 补丁版本 | 适配 ZCode 版本 | 状态 | 主要变化 |
|---|---|---|---|
| **v1.0.0（最新）** | **3.11.2 / 3.12.2 / 3.12.3** | ✅ 当前维护版本 | 首个版本：三种入口 + 每轮注入 + 会话隔离 + 加强注入 + 过时钩子 + 注入状态可见 |

> ⚠️ 本项目是**社区第三方补丁**，通过向 ZCode 的 CLI 核心（`zcode.cjs`）注入一行 require 并修改 `app.asar`（渲染层注入）实现，**与 ZCode 官方无关**。使用前请阅读 [DISCLAIMER.md](DISCLAIMER.md)。
>
> **ZCode 是闭源应用且更新频繁**——每次官方更新都可能让补丁失效。若你的 ZCode 版本不在上表中，请勿直接打补丁；可以提 Issue 告知你的版本号，我会评估适配。

---

<a name="english"></a>
## English

### Features

- 📌 **Three pin entry points**: type in the panel, hover a chat message, or select text — the button appears right inside ZCode's own selection toolbar (添加/询问 native actions)
- 🔁 **Every-turn re-injection**: the pin block is rewritten at the top of the system context on every single request (including tool-reply turns), so context compaction and long-conversation attention decay never touch it
- ⚡ **Boost mode (dual position)**: system top + a short reminder at the end of the LAST user turn — the query-aware pattern that weak models comply with far more reliably
- 🧲 **Complete-set declaration**: "the list is the current and only set; removed pins are NO LONGER in effect" — swapping/removing a pin cannot leave stale behaviors behind
- 🔔 **Stale hook**: the model flags a clearly-irrelevant pin with `[PIN_STALE:n]` as the last line; the client asks 解除/保留 once — never auto-removes (the model can misjudge)
- 🪪 **Request-level session identity**: injection reads `x-session-id` / `x-zcode-session-type` from each request itself — subagent calls are skipped, side chats never inherit the main conversation's pins
- 🧩 **Three API shapes**: OpenAI Chat Completions (`messages[]`), Anthropic Messages (`system` field), OpenAI Responses (`input[]`) are all recognized; uncovers endpoints show a yellow warning in the panel
- 👁 **Injection status line**: the panel shows "上轮已注入 N 条 · 模型 · 时间" — you always know whether your pins actually reached the model
- ✏️ **Manage**: up to 3 per conversation; edit (next turn effective), pause, delete; draggable floating icon that sticks to the composer's top/bottom edge (position remembered)
- 🔐 **Local config service** on `127.0.0.1:27892` with a per-install auth token and a challenge/HMAC handshake — a process squatting the port cannot harvest your token or pins
- 🛡️ **Fail-open + self-heal**: any wrapper error falls back to the original request; the UI retries verify and recovers on its own; the injected line is try/catch-wrapped so a broken wrapper file never breaks ZCode
- 🔄 **Multi-process fresh**: `fs.watch` + content compare keeps every ZCode process's pin snapshot in sync with writes from the port-holding one

### Install

**Prerequisites**: Windows 10/11, Python 3, Node.js (`npx`).

1. **Fully quit ZCode** (right-click the tray icon → Quit, not just closing the window)
2. Double-click `patch-pin.bat`, wait for `[SUCCESS]` (2–3 minutes; it extracts, injects and repacks `app.asar` with `--unpack "*.{node,dll,exe}"`)
3. Reopen ZCode — the 📌 icon appears above the composer (drag it along the top/bottom edge)

### Uninstall

1. Quit ZCode
2. Double-click `unpatch-pin.bat` — surgical removal: deletes only this patch's injected line and script block, keeps other injections (e.g. [zcode-skin-manager](https://github.com/Adam1290-0/zcode-skin-manager), [zcode-account-switcher](https://github.com/Adam1290-0/zcode-account-switcher), [zcode-route-override](https://github.com/Adam1290-0/zcode-route-override)). Pin data stays under `%USERPROFILE%\.zcode\plugins\pin\` — delete that folder to wipe it.

### Files

```
├── patch-pin.bat                 # one-click patch (extract → inject → repack, auto-restore on failure)
├── unpatch-pin.bat               # one-click surgical uninstall (this patch only)
├── inject-pin-wrapper.py         # zcode.cjs injector (idempotent, binary-safe, args for custom paths)
├── inject-pin-ui.py              # asar renderer injector (also creates the auth token)
├── uninject-pin-wrapper.py       # surgical wrapper removal (exact byte-line delete)
├── uninject-pin-ui.py            # surgical UI block removal
├── pin-core.js                   # pure logic: store + injection (3 API shapes) + session identity + HMAC
├── pin-wrapper.js                # fetch patch + local config service + challenge handshake
├── ui_pin.js                     # renderer UI: icon, panel, message/selection buttons, stale hook
└── tests/                        # 62 tests: store / inject / server / ui-smoke (vm + DOM stub)
```

### FAQ

**Q: The icon disappears after ZCode auto-updates?**
A: Updates overwrite `app.asar` and `zcode.cjs`. Re-run `patch-pin.bat` (each new ZCode version gets a fresh backup automatically). Check the [Version Matrix](#-版本对应表--version-matrix) first if ZCode jumped several versions.

**Q: The model ignores my pin?**
A: Injection success ≠ compliance. Weak models often ignore a system-only block — enable **⚡ boost** on that pin (dual-position injection). Writing the pin as an imperative with a verifiable action ("必须遵守：每次回复结尾都带【喵】") also helps far more than a role description ("你是猫娘").

**Q: Pin shows 上轮已注入 but zero pins in my current conversation?**
A: Status is per-conversation and expires after 10 minutes; a stale value is hidden automatically. The bubble on the icon also counts only this conversation.

**Q: A subagent / side chat got my pin?**
A: Shouldn't happen — injection reads `x-session-id`/`x-zcode-session-type` from each request and skips `subagent`. If you see it happen, please open an issue with the `pin-wrapper.log` lines (session ids only, no content).

### How it works

ZCode's CLI core (`zcode.cjs`) is a standalone Node process whose AI SDK resolves `globalThis.fetch` lazily, so patching that one function intercepts every upstream request. This tool injects a single try/catch `require` line after the route-override marker (`/*zro*/` → pin wraps OUTSIDE):

1. **Match** — the URL must end with `/chat/completions`, `/v1/messages` or `/v1/responses` and the method must be POST.
2. **Identify** — the request's own `x-session-id` (canonicalized) decides the conversation; `subagent` type is skipped; a missing id means no injection (fail-safe).
3. **Inject** — an idempotent marker block (`<!--PIN_BEGIN:v1-->`) is prepended to the system turn (or the Anthropic `system` field / Responses `input[]`), with the mandatory-requirements framing + complete-set declaration; boosted pins additionally append a short reminder to the last user turn.
4. **Serve** — `pin-wrapper.js` hosts the pin API on `127.0.0.1:27892` (challenge/HMAC handshake, token from the patch-time secret) and hot-reloads its store when other processes write the data file.
5. **UI** — the renderer script mounts a draggable floating icon against the visible composer (elementFromPoint hit-testing hides it under overlays like the settings page), the panel, the message hover button and the in-native-toolbar selection button, and polls for `[PIN_STALE:n]` markers.

---

<a name="中文"></a>
## 中文

### 特性

- 📌 **三种钉住入口**：面板手动输入 / 消息悬停钉 / 选中文字后直接在 ZCode 原生选择工具栏里的"钉住选中"
- 🔁 **每轮强制注入**：pin 块每轮（含工具续轮）都重写在 context 最顶部，上下文压缩与长对话注意力衰减都碰不到它
- ⚡ **加强注入（双位置）**：system 头部 + 最后一条用户消息尾部短提醒——query-aware 模式，小模型遵守率显著更高
- 🧲 **完整集声明**："列表即当前唯一集合，已解除的 pin 不再生效"——换 pin / 删 pin 不留历史惯性
- 🔔 **过时钩子**：模型判定某条 pin 明显不贴合时在回复末行输出 `[PIN_STALE:n]`，客户端一次询问"解除/保留"，默认不自动删（防误判）
- 🪪 **请求级会话身份**：注入读每个请求自带的 `x-session-id` / `x-zcode-session-type`——子 agent 自动跳过，侧聊不继承主对话的 pin
- 🧩 **三种 API 格式**：Chat Completions（`messages[]`）、Anthropic Messages（`system` 字段）、Responses（`input[]`）全部识别；未覆盖端点时面板黄条警告
- 👁 **注入状态可见**：面板显示"上轮已注入 N 条 · 模型 · 时间"——pin 有没有真的到达模型一目了然
- ✏️ **管理**：每会话 3 条上限；编辑（下轮生效）、暂停、删除；📌 图标可沿输入框上下沿线拖动，位置记忆
- 🔐 **本地服务**：`127.0.0.1:27892` + 每安装随机的 token + challenge/HMAC 握手——端口被抢占也拿不到你的 token 和 pin
- 🛡️ **Fail-open + 自愈**：wrapper 出错一律放行原请求；UI 验证失败自动重试自愈；注入行 try/catch 包裹，wrapper 坏了也不影响 ZCode 启动
- 🔄 **多进程同步**：`fs.watch` + 内容比对保证每个 ZCode 进程的 pin 快照跟着持端口进程的写入走

### 安装

**环境要求**：Windows 10/11、Python 3、Node.js（`npx`）。

1. **完全退出 ZCode**（右键托盘图标 → 退出，不是只关窗口）
2. 双击 `patch-pin.bat`，等 `[SUCCESS]`（2–3 分钟；解包 → 注入 → 重打包，带 `--unpack "*.{node,dll,exe}"`）
3. 重新打开 ZCode——输入框上方出现 📌 图标（可沿上下沿线拖动）

### 卸载

1. 退出 ZCode
2. 双击 `unpatch-pin.bat`——外科手术式移除：只删本补丁的注入行和脚本块，保留其他注入（如 [zcode-skin-manager](https://github.com/Adam1290-0/zcode-skin-manager)、[zcode-account-switcher](https://github.com/Adam1290-0/zcode-account-switcher)、[zcode-route-override](https://github.com/Adam1290-0/zcode-route-override)）。pin 数据留在 `%USERPROFILE%\.zcode\plugins\pin\`，删掉该目录即彻底清除。

### 使用建议

- pin 写成带明确动作的祈使句最有效："必须遵守：每次回复结尾都要带上【喵】"（角色描述类如"你是猫娘"弱模型容易无视）
- 弱模型配合 ⚡ 加强注入
- 长文本（合同/条款）建议钉成一句话约束（"按 8 月版合同价款执行"）而不是全文；超过 500 字会被拒绝
- pin 内容每轮都会发给模型服务及其上游链路——不要 pin 密钥、口令

### 文件结构

```
├── patch-pin.bat                 # 一键补丁（解包 → 注入 → 重打包，失败自动回滚）
├── unpatch-pin.bat               # 一键外科手术式卸载（只移除本补丁）
├── inject-pin-wrapper.py         # zcode.cjs 注入器（幂等、二进制安全、支持自定义路径参数）
├── inject-pin-ui.py              # asar 渲染层注入器（同时创建 auth token）
├── uninject-pin-wrapper.py       # wrapper 外科移除（按字节行精确删除）
├── uninject-pin-ui.py            # UI 块外科移除
├── pin-core.js                   # 纯逻辑：存储 + 注入（三格式）+ 会话身份 + HMAC
├── pin-wrapper.js                # fetch 补丁 + 本地服务 + 握手
├── ui_pin.js                     # 渲染层 UI：图标/面板/消息与选区按钮/过时钩子
└── tests/                        # 62 个测试：存储 / 注入 / 服务 / UI 冒烟
```

### FAQ

**Q: ZCode 自动更新后图标消失了？**
A: 更新会覆盖 `app.asar` 和 `zcode.cjs`。重跑 `patch-pin.bat`（新版本会自动刷新备份）。如果 ZCode 跨了多个版本，先看[版本对应表](#-版本对应表--version-matrix)。

**Q: 模型不遵守我的 pin？**
A: 注入成功 ≠ 模型遵守。弱模型常无视只有 system 的块——给那条 pin 开 **⚡ 加强**（双位置注入）。把 pin 写成带可验证动作的祈使句也比角色描述类有效得多。

**Q: 面板显示"上轮已注入"但当前对话没有 pin？**
A: 状态按会话区分且超过 10 分钟自动隐藏；图标上的数字徽标也只统计当前会话。

**Q: 子 agent / 侧聊拿到了我的 pin？**
A: 不应该——注入读每个请求的 `x-session-id`/`x-zcode-session-type` 并跳过 `subagent`。如果真发生了，请提 Issue 附上 `pin-wrapper.log` 相关行（只含会话 id，无内容）。

### 工作原理

ZCode 的 CLI 核心（`zcode.cjs`）是独立 Node 进程，其 AI SDK 惰性解析 `globalThis.fetch`，patch 这一个函数就能拦下所有上游请求。本工具在 route-override 标记（`/*zro*/`）之后注入一行 try/catch 的 `require`（pin 包在更外层）：

1. **匹配**——URL 需以 `/chat/completions`、`/v1/messages` 或 `/v1/responses` 结尾且为 POST。
2. **识别**——请求自带的 `x-session-id`（规范化）决定会话归属；`subagent` 类型跳过；无头不注入（fail-safe）。
3. **注入**——幂等标记块（`<!--PIN_BEGIN:v1-->`）前置到 system 轮（或 Anthropic 的 `system` 字段 / Responses 的 `input[]`），带强制要求框架 + 完整集声明；开启加强的 pin 额外在最后一条 user 轮尾追加短提醒。
4. **服务**——`pin-wrapper.js` 在 `127.0.0.1:27892` 提供 pin API（challenge/HMAC 握手，token 来自打补丁时生成的密钥）；其他进程写入数据文件时热重载 store。
5. **UI**——渲染层脚本把可拖动悬浮图标挂到可见的 composer（elementFromPoint 命中检测，被设置页等浮层盖住时自动隐藏）、面板、消息悬停按钮、以及原生选择工具栏内的选区按钮，并轮询检测 `[PIN_STALE:n]` 标记。

### 更新日志 / Changelog

### v1.0.0

- 🎉 首个版本：三种 pin 入口（面板输入 / 悬停消息 / 选区）+ 每轮强制注入 + 会话隔离 + 加强注入（双位置）+ 过时钩子 + 注入状态可见
- 🧩 三种 API 格式：Chat Completions / Anthropic Messages / Responses 全部识别
- 🔐 本地配置服务（challenge/HMAC 握手）+ fail-open + 多进程同步
- ✅ 验证适配 ZCode 3.12.2 / 3.12.3（请求层与 UI 层锚点全部保留，仅重打补丁；inject-pin-wrapper 增加 use-strict 回退锚点，解除对 route-override 先重打的依赖）

## License

[MIT](LICENSE)