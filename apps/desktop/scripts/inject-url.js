#!/usr/bin/env node
/**
 * 在构建前注入 CHAT_URL 到 index.html
 * 使用方式: CHAT_URL=https://your-domain.com bun run inject-url
 */
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const chatUrl = process.env.CHAT_URL || "http://localhost:3333";
const templatePath = join(__dirname, "../src/index.html.template");
const outPath = join(__dirname, "../src/index.html");
let html = readFileSync(templatePath, "utf-8");
const escaped = chatUrl.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
html = html.replace("{{CHAT_URL}}", escaped);
writeFileSync(outPath, html);
console.log("Injected CHAT_URL:", chatUrl);
