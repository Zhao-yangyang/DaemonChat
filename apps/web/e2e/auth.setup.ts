import { createClient, type Session } from "@supabase/supabase-js";
import { config } from "dotenv";
import * as path from "node:path";
import { test as setup } from "@playwright/test";

// 从 apps/web 目录加载 .env.local（E2E 运行时 cwd 通常是 apps/web）
config({ path: ".env.local" });
config({ path: path.join(process.cwd(), ".env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
const e2eEmail = process.env.E2E_TEST_EMAIL ?? "";
const e2ePassword = process.env.E2E_TEST_PASSWORD ?? "";

const authFile = path.join(process.cwd(), "playwright", ".auth", "user.json");

setup("authenticate", async ({ page }) => {
  if (!e2eEmail || !e2ePassword || !supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "E2E 认证需要配置环境变量: E2E_TEST_EMAIL, E2E_TEST_PASSWORD, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY。请参考 .env.local.example 并创建测试用户。"
    );
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data, error } = await supabase.auth.signInWithPassword({ email: e2eEmail, password: e2ePassword });
  if (error) {
    throw new Error(`E2E 登录失败: ${error.message}。请确认 Supabase 中已创建测试用户 ${e2eEmail}。`);
  }
  const session = data.session as Session;
  if (!session) {
    throw new Error("E2E 登录成功但未返回 session");
  }

  // Supabase v2 使用 sb-{projectRef}-auth-token 作为 localStorage key
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  const storageKey = `sb-${projectRef}-auth-token`;
  const storageValue = JSON.stringify({
    currentSession: JSON.parse(JSON.stringify(session)),
  });

  await page.goto(process.env.PLAYWRIGHT_TEST_BASE_URL ?? "http://localhost:3333");
  await page.evaluate(
    ({ key, value }) => {
      localStorage.setItem(key, value);
    },
    { key: storageKey, value: storageValue }
  );

  await page.context().storageState({ path: authFile });
});
