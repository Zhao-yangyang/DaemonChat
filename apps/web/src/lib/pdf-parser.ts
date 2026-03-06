import { PDFParse } from "pdf-parse";
import { logWarn } from "@/src/server/logger";

/**
 * 从 PDF buffer 提取纯文本内容。
 * 异常时返回空字符串并打日志。
 */
export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  try {
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    return typeof result?.text === "string" ? result.text.trim() : "";
  } catch (err) {
    logWarn("pdf_parser.extract_failed", {
      error_message: err instanceof Error ? err.message : String(err),
    });
    return "";
  }
}
