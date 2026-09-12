"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function toggleReadAction(formData) {
  const id = formData.get("id");
  const nextValue = formData.get("nextValue") === "true";
  const supabase = await createClient();

  const { error } = await supabase
    .from("links")
    .update({ is_read: nextValue })
    .eq("id", id);

  if (error) {
    console.error("[dashboard] 읽음 상태 변경 실패", id, error);
  }
  revalidatePath("/dashboard");
}

export async function toggleArchiveAction(formData) {
  const id = formData.get("id");
  const nextValue = formData.get("nextValue") === "true";
  const supabase = await createClient();

  const { error } = await supabase
    .from("links")
    .update({ is_archived: nextValue })
    .eq("id", id);

  if (error) {
    console.error("[dashboard] 보관 상태 변경 실패", id, error);
  }
  revalidatePath("/dashboard");
}

export async function deleteLinkAction(formData) {
  const id = formData.get("id");
  const supabase = await createClient();

  const { error } = await supabase.from("links").delete().eq("id", id);

  if (error) {
    console.error("[dashboard] 삭제 실패", id, error);
  }
  revalidatePath("/dashboard");
}
