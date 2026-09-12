import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const PAGE_SIZE = 12;

export async function GET(request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim().toLowerCase();
  const category = searchParams.get("category") || "all";
  const status = searchParams.get("status") || "all";
  const view = searchParams.get("view") === "archived" ? "archived" : "active";
  const offset = Number(searchParams.get("offset") ?? 0) || 0;

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

  // 키워드 검색은 PostgREST .or() 필터의 특수문자 이스케이프 이슈를 피하려고
  // 여기서 직접 필터링한다 (개인 북마크 규모라 성능 문제 없음).
  const filtered = q
    ? (data ?? []).filter((link) =>
        [link.title, link.summary, link.raw_url]
          .filter(Boolean)
          .some((field) => field.toLowerCase().includes(q))
      )
    : data ?? [];

  const page = filtered.slice(offset, offset + PAGE_SIZE);
  const hasMore = offset + PAGE_SIZE < filtered.length;

  return NextResponse.json({ links: page, hasMore });
}
