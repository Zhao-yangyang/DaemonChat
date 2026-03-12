import { NextResponse } from "next/server";

export function GET() {
  // Only available in development
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKeyLen = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").length;

  return NextResponse.json({
    supabaseUrl,
    anonKeyLen,
    hasUrl: supabaseUrl.length > 0,
    hasKey: anonKeyLen > 0,
    urlValid: supabaseUrl.startsWith("https://"),
  });
}
