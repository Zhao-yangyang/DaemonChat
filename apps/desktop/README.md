# DaemonChat Desktop

Tauri + WebView 桌面客户端 POC，加载 DaemonChat Web 聊天页。

## 前置条件

1. 安装 [Tauri  prerequisites](https://tauri.app/start/prerequisites/)（Rust、系统依赖）
2. 确保 `apps/web` 已启动（或生产环境已部署）

## 开发

```bash
# 终端 1：启动 Web 应用
bun run dev --filter @daemon/web

# 终端 2：启动 Desktop
bun run dev
```

默认加载 `http://localhost:3333/zh/chat`。

## 构建

```bash
bun run build
```

产物在 `src-tauri/target/release/`（或 `debug/`）。

### 生产 URL

构建时指定 `CHAT_URL` 指向部署地址：

```bash
CHAT_URL=https://your-daemonchat-domain.com bun run build
```

## 环境变量

- `CHAT_URL`：聊天页 Base URL，默认 `http://localhost:3333`。在 `beforeDevCommand` / `beforeBuildCommand` 时注入到 `src/index.html`。
