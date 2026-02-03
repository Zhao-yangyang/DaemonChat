import Link from "next/link";

export default function ChatIndexPage() {
  return (
    <main>
      <h2>Chat</h2>
      <p>请选择一个 Agent 开始对话。</p>
      <Link href="/agents">前往 Agents</Link>
    </main>
  );
}
