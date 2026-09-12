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
  const profileImageUrl =
    user.user_metadata?.avatar_url ?? user.user_metadata?.picture;

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
      <div className="flex items-center gap-2">
        <img src="/logo.svg" alt="" className="h-7 w-7 rounded-lg" />
        <h1 className="text-xl font-bold text-neutral-900">스크랩모아</h1>
      </div>

      <div className="mt-3 flex items-center gap-2">
        {profileImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- 카카오 CDN 프로필 이미지, next/image 도메인 등록 불필요하게 단순 사용
          <img
            src={profileImageUrl}
            alt=""
            className="h-8 w-8 flex-shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-neutral-200 text-sm font-medium text-neutral-500">
            {nickname?.[0] ?? "?"}
          </div>
        )}
        <p className="text-sm text-neutral-500">
          {nickname ? `${nickname}님, 환영합니다.` : "환영합니다."}
        </p>
      </div>

      <LinkCodeGenerator />

      <LinksExplorer categories={categories} initialFilters={initialFilters} />
    </main>
  );
}
