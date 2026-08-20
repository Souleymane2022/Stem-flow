import { createFileRoute, Link } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/layout/AppShell";
import { SkeletonList } from "@/components/common/Skeleton";
import { PageHeader } from "@/components/common/PageHeader";
import { useI18n } from "@/lib/i18n";
import { categoryMeta } from "@/lib/categories";

export const Route = createFileRoute("/rooms/")({
  head: () => ({
    meta: [
      { title: "Salons STEM — STEMFLOW" },
      {
        name: "description",
        content:
          "Rejoins des salons thématiques : astronomie, code, robotique, maths et plus encore.",
      },
      { property: "og:title", content: "Salons STEM — STEMFLOW" },
      {
        property: "og:description",
        content: "Discute avec des passionnés de sciences dans des salons dédiés.",
      },
    ],
  }),
  component: RoomsPage,
});

type Room = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  member_count: number;
};

function RoomsPage() {
  const { t } = useI18n();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data } = await supabase
        .from("rooms")
        .select("id,name,description,category,member_count")
        .order("member_count", { ascending: false });
      if (!alive) return;
      setRooms((data as Room[]) ?? []);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-10">
        <PageHeader
          icon={<Users className="h-6 w-6 text-primary" />}
          title={t("rooms.title")}
          subtitle={t("rooms.subtitle")}
        />

        {loading && (
          <div className="mt-6">
            <SkeletonList rows={4} />
          </div>
        )}

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {rooms.map((room) => {
            const meta = categoryMeta(room.category);
            return (
              <Link
                key={room.id}
                to="/rooms/$id"
                params={{ id: room.id }}
                className={`rounded-2xl border border-border bg-gradient-to-br p-5 transition-colors hover:border-primary/40 ${meta.gradient}`}
              >
                <span className="text-2xl">{meta.emoji}</span>
                <h2 className="mt-3 text-lg font-extrabold">{room.name}</h2>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {room.description}
                </p>
                <p className="mt-3 text-[11px] font-bold text-primary">
                  {room.member_count} membres
                </p>
              </Link>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
