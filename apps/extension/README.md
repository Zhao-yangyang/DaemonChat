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

### 生产构建

生产环境需指向已部署的 Web 地址：

```bash
VITE_CHAT_URL=https://your-daemonchat-domain.com bun run build
```

打包为 zip 便于分发：

```bash
bun run zip
```

## 环境变量

- `VITE_CHAT_URL`：聊天页地址，默认 `http://localhost:3333`。生产环境设为部署 URL 后构建即可。

## 图标

扩展使用 `public/icon-16.png`、`public/icon-48.png`、`public/icon-128.png`，由 `apps/web/app/icon.png` 缩放生成。修改主图标后可用 `sips` 重新生成：`sips -z 16 16 ../../web/app/icon.png --out public/icon-16.png` 等。
