import { resolveApiUserFromAccessToken } from "@/src/server/auth";
import { logError, logInfo, logWarn } from "@/src/server/logger";
import { extractTextFromPdf } from "@/src/lib/pdf-parser";
import { createSupabaseClient } from "@daemon/adapters-supabase";

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
]);
const BUCKET_NAME = "chat-attachments";

export async function POST(req: Request) {
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();

  const user = await resolveApiUserFromAccessToken({
    supabaseUrl: SUPABASE_URL,
    supabaseAnonKey: SUPABASE_ANON_KEY,
    accessToken: req.headers.get("x-access-token"),
  });
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json", "X-Request-Id": requestId },
    });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid form data" }), {
      status: 400,
      headers: { "Content-Type": "application/json", "X-Request-Id": requestId },
    });
  }

  const file = formData.get("file") as File | null;
  const agentId = formData.get("agentId") as string | null;
  const sessionId = formData.get("sessionId") as string | null;

  if (!file || !agentId || !sessionId) {
    return new Response(
      JSON.stringify({ error: "Missing file, agentId, or sessionId" }),
      { status: 400, headers: { "Content-Type": "application/json", "X-Request-Id": requestId } }
    );
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return new Response(
      JSON.stringify({
        error: `Unsupported file type: ${file.type}. Allowed: jpeg, png, gif, webp, pdf`,
      }),
      { status: 415, headers: { "Content-Type": "application/json", "X-Request-Id": requestId } }
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    return new Response(
      JSON.stringify({ error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max: 10 MB` }),
      { status: 413, headers: { "Content-Type": "application/json", "X-Request-Id": requestId } }
    );
  }

  try {
    const supabase = createSupabaseClient({
      url: SUPABASE_URL,
      anonKey: SUPABASE_ANON_KEY,
      accessToken: req.headers.get("x-access-token") ?? undefined,
    });

    const ext = file.name.split(".").pop() ?? "bin";
    const storagePath = `${user.id}/${agentId}/${sessionId}/${crypto.randomUUID()}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let textContent: string | undefined;
    if (file.type === "application/pdf") {
      textContent = await extractTextFromPdf(buffer);
    }

    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(storagePath, buffer, { contentType: file.type, upsert: false });

    if (uploadError) {
      logError("chat.upload.storage_error", {
        request_id: requestId,
        user_id: user.id,
        agent_id: agentId,
        error_message: uploadError.message,
      });
      return new Response(
        JSON.stringify({ error: "Failed to upload file to storage" }),
        { status: 500, headers: { "Content-Type": "application/json", "X-Request-Id": requestId } }
      );
    }

    const { data: urlData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(storagePath);

    const { data: attachment, error: dbError } = await supabase
      .from("chat_attachments")
      .insert({
        user_id: user.id,
        agent_id: agentId,
        session_id: sessionId,
        file_name: file.name,
        content_type: file.type,
        storage_path: storagePath,
        byte_size: file.size,
        text_content: textContent ?? null,
      })
      .select("id, file_name, content_type, byte_size, created_at")
      .single();

    if (dbError) {
      logWarn("chat.upload.db_error", {
        request_id: requestId,
        user_id: user.id,
        agent_id: agentId,
        error_message: dbError.message,
      });
    }

    logInfo("chat.upload.success", {
      request_id: requestId,
      user_id: user.id,
      agent_id: agentId,
      session_id: sessionId,
      file_name: file.name,
      byte_size: file.size,
    });

    return new Response(
      JSON.stringify({
        id: attachment?.id ?? null,
        url: urlData.publicUrl,
        fileName: file.name,
        contentType: file.type,
        byteSize: file.size,
        textContent: textContent ?? undefined,
      }),
      { status: 200, headers: { "Content-Type": "application/json", "X-Request-Id": requestId } }
    );
  } catch (err) {
    logError("chat.upload.unexpected_error", {
      request_id: requestId,
      user_id: user.id,
      error_message: err instanceof Error ? err.message : String(err),
    });
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json", "X-Request-Id": requestId } }
    );
  }
}
