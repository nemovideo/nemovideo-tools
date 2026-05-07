# NemoVideo CLI 技术实现方案

> 基于 nemo-mega-x-api-gateway 实现的 CLI 化一期方案，对应飞书文档《NemoVideo CLI 化方案（一期）— Coding 类》。

---

## 一、核心思路

**后端几乎零改动。** Gateway 仅需在 verify_token 加 `nmv_usr_*` 分支，其余全复用现有 API。
编排逻辑在客户端（nemo-core）完成，与 mega-skill 教 agent 编排是同一模式。

| 对比 | mega-skill | nemovideo-tools |
|------|-----------|---------------|
| 后端 | nemo-mega | nemo-mega-x-api-gateway |
| 形态 | SKILL.md（agent 读 curl 指令） | npm CLI + SKILL.md |
| 认证 | anonymous bootstrap（免费 100 积分） | **API Token `nmv_usr_*`（付费前置）** |
| 编排位置 | agent 按文档执行 | nemo-core TypeScript 编排 |
| 后端改动 | 无 | **verify_token 加 `nmv_usr_*` 分支** |

---

## 二、整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                      Client Layer                           │
├─────────────┬─────────────┬─────────────┬──────────────────┤
│ Claude Code │   Cursor    │    CLI      │  Other IDEs      │
│   Plugin    │  Extension  │  (npm/npx)  │  (MCP Config)    │
└──────┬──────┴──────┬──────┴──────┬──────┴────────┬─────────┘
       │             │             │               │
       └─────────────┴──────┬──────┴───────────────┘
                            │
                    ┌───────▼───────┐
                    │   nemo-core   │  ← @nemovideo/core (npm)
                    │  编排 + 客户端 │
                    └───────┬───────┘
                            │ HTTPS / WSS (直接调用现有 API)
              ┌─────────────▼─────────────┐
              │  nemo-mega-x-api-gateway  │
              │  (verify_token 加 nmv_usr_)  │
              │                           │
              │  /auth/verify              │
              │  /projects                 │
              │  /ws/chat                  │
              │  /billing/balance          │
              │  /services/v1/render-proxy │
              │  /api/v1/state/frontend    │
              │  /files/upload             │
              └───────────────────────────┘
```

nemo-core 做"厚客户端"编排，与 mega-skill 教 agent 做编排是同一个模式，只是从文档变成了代码。

---

## 三、认证方案：付费前置

### 3.1 用户链路

```
nemovideo setup
  → 打开 nemovideo.com/register 注册
  → 打开 nemovideo.com/dashboard/billing 充值
  → 在 nemovideo.com/workspace/api-keys 生成 API Token
  → 粘贴到 CLI: nemovideo config set api_key <nmv_usr_xxx>
  → CLI 验证 key 有效 + 余额 > 0 → 配置完成
```

**CLI 无匿名模式、无免费试用。** 必须先注册 + 充值 + 获取 API Key 才能使用。

### 3.2 API Token 认证

nemovideo.com 前端已有 API Token 管理页面（生成 / 查看 / 撤销）。

Token 格式：`nmv_usr_KGdwtlGw3hBDUpV-4_FJfEgYqFbTXQuYPKPxxxxxxxx`

**Gateway 需要补一小块：** 当前 `verify_token` 只有 Legacy JWT + Firebase 两个策略，
需要加入 `nmv_usr_*` token 验证。

```
# src/auth/middleware.py - verify_token 当前实现:
1. Legacy HS256 JWT  → verify_legacy_token()
2. Firebase RS256    → verify_firebase_token()

# 需要新增:
0. nmv_usr_ 前缀 → verify_api_token()   ← 新增，查 MongoDB
1. Legacy HS256 JWT
2. Firebase RS256
```

CLI 所有请求使用 `Authorization: Bearer nmv_usr_xxx`。

### 3.3 完整 API 映射

所有请求携带 `Authorization: Bearer nmv_usr_...`。

| CLI 命令 | 调用的 Gateway API | 说明 |
|----------|-------------------|------|
| `nemovideo setup` | (无 API 调用，引导用户去网页注册充值) | 仅本地配置 |
| `nemovideo config set api_key` | `POST /auth/verify` | 验证 key 有效性 |
| `nemovideo create` | `POST /projects` | 创建项目 + session |
| | `WS /ws/chat?token=&session_id=` | 发送 prompt，等待 agent 完成 |
| | (加 `--export` 时自动调 export 流程) | |
| `nemovideo chat <id>` | `GET /projects/{id}/sessions` | 获取 session_id |
| | `WS /ws/chat?token=&session_id=` | 发送消息，监听响应 |
| `nemovideo export <id>` | `GET /api/v1/state/frontend/{id}` | 获取 draft |
| | `POST /services/v1/render-proxy/lambda` | 提交渲染 |
| | `GET /services/v1/render-proxy/lambda/{id}` | 轮询 |
| | `GET /services/v1/render-proxy/{id}/download` | 下载 |
| `nemovideo upload` | `POST /files/upload` | 上传素材 |
| `nemovideo open <id>` | `POST /api/auth/exchange-claim-token` | 获取 claim token，打开浏览器 |
| `nemovideo project list` | `GET /projects` | 列出项目 |
| `nemovideo project get <id>` | `GET /projects/{id}` + `GET /api/v1/state/frontend/{id}` | 查状态 |
| `nemovideo project download <id>` | `GET /services/v1/render-proxy/{id}/download` | 下载成品 |
| `nemovideo credits` | `GET /billing/balance` | 查余额 |
| `nemovideo credits history` | `GET /billing/usage/conversations` | 消费记录 |

### 3.4 核心编排流程

#### `nemovideo create` 流程

```
1. POST /projects { create_session: true }    → project_id, session_id
2. WS /ws/chat?token=xxx&session_id=xxx       → 建立连接
3. WS send { prompt }                         → 等待 agent 响应
4. 监听 WS 消息，转为 CLI 进度展示
5. 收到 done → WS close，输出 project_id
6. (若 --export) 自动执行 export 流程
```

#### `nemovideo chat` 流程

```
1. GET /projects/{id}/sessions                → 获取 session_id
2. WS /ws/chat?token=xxx&session_id=xxx       → 建立连接
3. WS send { prompt }                         → 等待 agent 响应
4. 监听 WS 消息，转为 CLI 进度展示
5. 收到 done → WS close
```

#### `nemovideo export` 流程

```
1. GET /api/v1/state/frontend/{project_id}    → 获取 draft，校验非空
2. POST /services/v1/render-proxy/lambda      → 提交渲染
3. 轮询 GET .../lambda/{render_id}            → 等待完成
4. 下载 output.url → 保存本地
```

超时处理：WS 心跳保活，10min 总超时，渲染 5min 超时。

### 3.5 WebSocket `/ws/chat` 协议详情

连接：`wss://<base_url>/ws/chat?token=<nmv_usr_xxx>&session_id=<sid>`

#### CLI → Gateway（发送）

```json
// 发送消息（触发 agent）
{"type": "message", "content": "5秒咖啡产品展示", "metadata": {}}

// 心跳
{"type": "ping"}

// 中断当前生成
{"type": "abort"}
```

#### Gateway → CLI（接收）

```json
// 连接就绪
{"type": "session_ready", "session_id": "..."}

// Sandbox 启动中
{"type": "warming_up"}
{"type": "status", "status": "sandbox_startup", "sandbox_id": "..."}

// 消息已接受
{"type": "message_accepted", "client_message_id": "..."}

// Agent 流式输出
{"type": "chunk", "text": "..."}           // 文本片段
{"type": "text", "text": "..."}            // 完整文本
{"type": "thinking_start"}                 // 思考开始
{"type": "thinking_chunk", "text": "..."}  // 思考片段
{"type": "thinking_end"}                   // 思考结束
{"type": "tool_start", ...}                // 工具调用开始
{"type": "tool_end", ...}                  // 工具调用结束
{"type": "done"}                           // 本轮结束

// 心跳回复
{"type": "pong"}

// 错误
{"type": "error", "error": "..."}
```

#### WS 消息处理逻辑（create / chat 共用）

```
收到 warming_up        → 显示 "启动 Agent..." spinner
收到 session_ready     → 发送 {"type": "message", "content": prompt}
收到 chunk/text        → 显示 agent 回复
收到 thinking_*        → 显示 "AI 思考中..." spinner
收到 tool_start/end    → 显示 "处理中..." spinner（静默等待）
收到 done              → WS close，返回 project_id
收到 error             → 显示错误，退出
收到 ping              → 回复 {"type": "ping"}（保活）
超时 10min 无 done     → 查询 state 尝试恢复
```

#### WS Close Codes

| Code | 含义 |
|------|------|
| 4001 | 认证失败（token 无效） |
| 4002 | 缺少 session_id |

---

## 四、项目结构与技术选型

### 4.1 项目结构

单包，不搞 monorepo。core 作为内部模块，后续有需要再拆 npm 包。

```
nemovideo-tools/
├── package.json               # bin: { "nemovideo": "./dist/index.js" }
├── tsconfig.json
├── tsup.config.ts
├── src/
│   ├── index.ts               # CLI 入口 (Commander.js)
│   ├── commands/
│   │   ├── setup.ts           # nemovideo setup
│   │   ├── config.ts          # nemovideo config set/get
│   │   ├── create.ts          # nemovideo create
│   │   ├── chat.ts            # nemovideo chat
│   │   ├── export.ts          # nemovideo export
│   │   ├── upload.ts          # nemovideo upload
│   │   ├── open.ts            # nemovideo open
│   │   ├── project.ts         # nemovideo project list/get/download
│   │   └── credits.ts         # nemovideo credits
│   ├── core/                  # Gateway API 客户端
│   │   ├── client.ts          # HTTP 封装 (fetch)
│   │   ├── ws.ts              # WebSocket 封装
│   │   ├── auth.ts            # API token 验证
│   │   ├── agent.ts           # WS 编排 (create/chat 共用)
│   │   ├── render.ts          # 渲染提交 + 轮询 + 下载
│   │   └── types.ts           # 类型定义
│   ├── config.ts              # ~/.config/nemovideo/ 读写
│   └── ui.ts                  # ora spinner + chalk + 格式化
├── SKILL.md
└── README.md
```

### 4.2 自动升级

启动时用 `update-notifier` 检查 npm registry（每天一次，有缓存不阻塞启动）：

```
⚠ 有新版本 1.2.0 (当前 1.0.0)，运行 npm update -g nemovideo-tools 升级
```

### 4.3 技术选型（npm 包名: nemovideo-tools）

| 组件 | 选型 | 理由 |
|------|------|------|
| 语言 | TypeScript 5 | 类型安全 |
| 运行时 | Node.js >= 18 | 原生 fetch + WebSocket |
| CLI | Commander.js | 轻量成熟 |
| WebSocket | ws | Node.js 标准 |
| 终端 UI | ora + chalk | spinner + 颜色 |
| 配置 | conf | XDG 跨平台 |
| 升级检查 | update-notifier | npm 标准做法 |
| 打包 | tsup | 零配置 |
| 分发 | npm / npx | 零安装 |

### 4.4 本地配置

路径：`~/.config/nemovideo/config.json`

```json
{
  "api_key": "nmv_usr_xxxxxxxxxxxxx",
  "base_url": "https://mega-x-api-prod.nemovideo.ai",
  "output_dir": "./output"
}
```

测试环境用 `mega-x-api-dev.nemovideo.ai`，生产用 `mega-x-api.nemovideo.ai`。
默认值设为生产。

### 4.5 命令总览

```
nemovideo
├── setup                       # 注册+充值+配置引导
├── config
│   ├── set <key> <value>       # 设置配置
│   └── get [key]               # 查看配置
├── create -p "..."             # 创建新项目 + 生成视频
├── chat <project_id> -p "..."  # 对已有项目发消息（追加编辑）
├── export <project_id>         # 导出/渲染视频
├── upload <file> --project <id># 上传素材到项目
├── open <project_id>           # 在浏览器中打开项目
├── project
│   ├── list                    # 列出项目
│   ├── get <id>                # 查看项目详情
│   └── download <id>           # 下载成品视频
└── credits
    ├── (default)               # 查看余额
    └── history                 # 消费记录
```

### 4.6 命令 UX 详情

#### `nemovideo setup`

```
$ nemovideo setup

  NemoVideo CLI 🎬

  CLI 需要先注册并充值才能使用（免费试用请访问 nemovideo.com）

  1. 注册账户
     → 打开 nemovideo.com/register ...
     ? 注册完成了吗？(Y/n)

  2. 充值
     → 打开 nemovideo.com/dashboard/billing ...
     ? 充值完成了吗？(Y/n)

  3. 获取 API Key
     → 打开 nemovideo.com/dashboard/api-tokens ...
     ? 粘贴你的 API Key: nmv_usr_xxxxxxxxxxxxx

  ◐ 验证中...
  ✓ 验证成功！余额: 500 credits

  现在可以运行: nemovideo create --prompt "你的视频描述"
```

如已配置 key 且有效则跳过，直接显示余额。

#### `nemovideo create`

```
$ nemovideo create -p "5秒咖啡产品展示，暖色调"

  ◐ 创建项目...
  ◐ 连接 Agent...
  ◐ AI 正在生成脚本...
    > "好的，正在制作暖色调咖啡产品展示..."
  ◐ 视频生成中... ████████████████ 100%

  ✓ 完成！项目: proj_abc
    消耗 100 credits | 余额 400
    导出: nemovideo export proj_abc
    编辑: nemovideo chat proj_abc -p "加个背景音乐"

# 加 --export 一步到位
$ nemovideo create -p "5秒咖啡产品展示" --export

  ...（同上）
  ◐ 渲染中... ████████████████ 100%
  ✓ 完成！./output/coffee-demo.mp4
```

| 参数 | 短写 | 默认 |
|------|------|------|
| `--prompt` | `-p` | (必需) |
| `--duration` | `-d` | 5 |
| `--ratio` | `-r` | 16:9 |
| `--export` | `-e` | 不加则仅生成，不渲染 |
| `--output` | `-o` | `./output/<name>.mp4`（需配合 --export） |

#### `nemovideo chat`

对已有项目发送后续指令（追加编辑）。内部跳过创建项目，直接连 WS 发消息。

```
$ nemovideo chat proj_abc -p "加个背景音乐"

  ◐ 连接 Agent...
    > "好的，正在添加背景音乐..."
  ◐ 处理中... ████████████████ 100%

  ✓ 完成！
    编辑: https://nemovideo.com/workspace/claim?ct=clm_xxx

$ nemovideo chat proj_abc -p "时长改成10秒"
```

| 参数 | 短写 | 默认 |
|------|------|------|
| `<project_id>` | | (必需) |
| `--prompt` | `-p` | (必需) |

#### `nemovideo export`

手动触发渲染导出。`nemovideo create` 默认不渲染，生成后用此命令导出。也可在 `nemovideo chat` 编辑后使用。

```
$ nemovideo export proj_abc

  ◐ 检查 draft...
  ◐ 渲染中... ████████████████ 100%

  ✓ 完成！./output/coffee-demo.mp4
    消耗 0 credits（导出免费）
```

| 参数 | 短写 | 默认 |
|------|------|------|
| `<project_id>` | | (必需) |
| `--output` | `-o` | `./output/<name>.mp4` |

#### `nemovideo upload`

上传素材文件到项目。

```
$ nemovideo upload ./my-footage.mp4 --project proj_abc

  ◐ 上传中... ████████████████ 100%
  ✓ 已上传 my-footage.mp4
```

| 参数 | 短写 | 默认 |
|------|------|------|
| `<file>` | | (必需) |
| `--project` | | (必需) |

支持格式：mp4, mov, avi, webm, mkv, jpg, png, gif, webp, mp3, wav, m4a, aac。

#### `nemovideo open`

在浏览器中打开项目编辑页面。

```
$ nemovideo open proj_abc
  → 正在打开 https://nemovideo.com/workspace/claim?ct=clm_xxx ...
```

#### `nemovideo project list / get / download`

```
$ nemovideo project list
  ID         Status     Prompt              Created
  proj_abc   completed  咖啡产品展示         2min ago

$ nemovideo project download proj_abc -o ./video.mp4
  ✓ 已保存 ./video.mp4 (2.3MB)
```

#### `nemovideo credits`

```
$ nemovideo credits
  可用: 400 | 冻结: 100 | 累计消耗: 500
  充值: nemovideo.com/dashboard/billing
```

---

## 五、SKILL.md 设计

nemovideo-tools 的 SKILL.md 面向 AI IDE Agent（Cursor / Claude Code 等），教它们调用 CLI 命令。

与 mega-skill 的关键区别：
- mega-skill 教 agent 发 HTTP 请求（curl）
- nemovideo-tools 教 agent 执行本地 CLI 命令（nemovideo create）

```markdown
---
name: nemo-video
version: "2.0"
description: >
  AI video creation via CLI. Create and edit videos by running
  nemovideo commands. Requires API key from nemovideo.com.
---

# NemoVideo CLI

## Setup
If `nemovideo credits` fails, run `nemovideo setup` to configure API key.

## Create Video
nemovideo create --prompt "description" [--duration N] [--ratio 16:9|9:16|1:1]
nemovideo create --prompt "description" --export    # create + auto export

## Edit Existing Project
nemovideo chat <project_id> --prompt "add background music"

## Export / Download
nemovideo export <project_id> [--output ./video.mp4]

## Upload Assets
nemovideo upload ./file.mp4 --project <project_id>

## Open in Browser
nemovideo open <project_id>

## Project Management
nemovideo project list
nemovideo project get <project_id>
nemovideo project download <project_id> [--output ./video.mp4]

## Check Credits
nemovideo credits
nemovideo credits history
```

（完整 SKILL.md 在实现阶段编写，包含错误处理、示例等。）

---

## 六、错误处理

直接映射 gateway 返回的 error code，CLI 翻译为用户友好提示：

| Gateway code | CLI 展示 |
|-------------|----------|
| 非 200 / 无 token | "运行 `nemovideo setup` 配置账户" |
| 1010/1011 | "Token 已失效，运行 `nemovideo setup`" |
| 2001 | "积分不足，充值: nemovideo.com/dashboard/billing" |
| 402 | "功能受限，请升级套餐" |
| 429 | "请求过于频繁，稍后重试" |
| WS 断连 | 自动重连 1 次，失败提示 `nemovideo project get <id>` 恢复 |
| 渲染失败 | 重试 1 次，仍失败提示手动重试 |

---

## 七、埋点

请求 header 携带平台信息（复用 mega-skill attribution 模式，gateway 已支持）：

```
X-Skill-Source: nemovideo-tools
X-Skill-Version: 1.0.0
X-Skill-Platform: cursor | claude_code | terminal
```

Gateway 侧 Mixpanel 自动记录，CLI 无需额外上报。

---

## 八、实施步骤

1. Gateway: `src/auth/middleware.py` verify_token 加 `nmv_usr_*` 验证分支
2. nemovideo-tools 项目脚手架 + `core/client.ts` + `core/types.ts`
3. `core/auth.ts` + `nemovideo setup` + `nemovideo config` + `nemovideo credits`
4. `core/agent.ts`（WS 编排，create/chat 共用）+ `core/render.ts`
5. `nemovideo create` + `nemovideo chat` + `nemovideo export` + 进度 UI
6. `nemovideo upload` + `nemovideo open` + `nemovideo project list/get/download`
7. SKILL.md + README + npm 发布配置
8. 联调测试（接真实 gateway）

---

## 九、环境配置

| 环境 | Gateway URL |
|------|-------------|
| 生产 | `https://mega-x-api-prod.nemovideo.ai`（默认） |
| 测试 | `https://mega-x-api-dev.nemovideo.ai` |

通过 `nemovideo config set base_url <url>` 切换。
