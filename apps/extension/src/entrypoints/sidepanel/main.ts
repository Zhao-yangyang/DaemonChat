// 配置聊天页 URL：开发时用 localhost，生产用部署地址
const CHAT_BASE =
  typeof import.meta.env?.VITE_CHAT_URL === "string" && import.meta.env.VITE_CHAT_URL
    ? import.meta.env.VITE_CHAT_URL
    : "http://localhost:3333";

const CHAT_PATH = "/zh/chat";

document.addEventListener("DOMContentLoaded", () => {
  const iframe = document.getElementById("chat-frame") as HTMLIFrameElement;
  if (iframe) {
    iframe.src = `${CHAT_BASE}${CHAT_PATH}`;
  }
});
