import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category") || "all";
  const status = searchParams.get("status") || "all";
  const view = searchParams.get("view") === "archived" ? "archived" : "active";

  // 키워드 검색은 서버 왕복 없이 클라이언트에서 즉시 처리하므로, 여기서는
  // 카테고리/상태/보관여부로만 걸러서 전부(개인 북마크 규모) 내려준다.
  let query = supabase
    .from("links")
    .select(
      "id, raw_url, resolved_url, source_domain, title, summary, category, tags, thumbnail_url, status, is_read, is_archived, created_at"
    )
    .eq("is_archived", view === "archived")
    .order("created_at", { ascending: false });

  if (category !== "all") {
    query = query.eq("category", category);
  }
  if (status !== "all") {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[api/links] 조회 실패", error);
    return NextResponse.json({ error: "조회에 실패했어요." }, { status: 500 });
  }

  return NextResponse.json({ links: data ?? [] });
}
