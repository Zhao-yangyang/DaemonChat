import { defineConfig } from "wxt";

export default defineConfig({
  srcDir: "src",
  manifest: {
    name: "DaemonChat",
    description: "AI 长期助手 - 在任意页面唤起聊天",
    version: "0.0.0",
    permissions: ["sidePanel"],
  },
});
