import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LinkCodeGenerator from "./LinkCodeGenerator";
import LinksExplorer from "./LinksExplorer";

export default async function DashboardPage({ searchParams }) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const nickname = user.user_metadata?.name ?? user.user_metadata?.nickname;

  const { data: categoryRows } = await supabase
    .from("links")
    .select("category")
    .not("category", "is", null);
  const categories = [...new Set((categoryRows ?? []).map((row) => row.category))].sort();

  const initialFilters = {
    q: params?.q ?? "",
    category: params?.category || "all",
    status: params?.status || "all",
    view: params?.view === "archived" ? "archived" : "active",
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-xl font-bold text-neutral-900">대시보드</h1>
      <p className="mt-2 text-sm text-neutral-500">
        {nickname ? `${nickname}님, 환영합니다.` : "환영합니다."}
      </p>

      <LinkCodeGenerator />

      <LinksExplorer categories={categories} initialFilters={initialFilters} />
    </main>
  );
}
