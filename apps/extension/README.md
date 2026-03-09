# DaemonChat Extension

Chrome 扩展，通过侧边栏在任意页面唤起 DaemonChat 聊天。

## 开发

1. 确保 `apps/web` 已启动：`bun run dev --filter @daemon/web`
2. 开发模式：`bun run dev`
3. 点击扩展图标，侧边栏会加载 `http://localhost:3333/zh/chat`（或 `VITE_CHAT_URL` 指向的地址）

## 构建

```bash
bun run build
```

产物在 `.output/chrome-mv3/`，可在 Chrome 扩展管理页通过「加载已解压的扩展程序」安装。

## 环境变量

- `VITE_CHAT_URL`：聊天页地址，默认 `http://localhost:3333`。生产环境可设为部署 URL。
