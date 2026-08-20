import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Award, Printer } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { BrandLogo } from "@/components/brand/BrandLogo";

export const Route = createFileRoute("/certificates/$serial")({
  head: () => ({
    meta: [
      { title: "Certificat — STEMFLOW" },
      {
        name: "description",
        content:
          "Vérifiez l'authenticité d'un certificat STEMFLOW à partir de son numéro de série.",
      },
    ],
  }),
  component: CertificatePage,
});

type Certificate = {
  serial: string;
  recipient_name: string;
  course_title: string;
  issued_at: string;
};

function CertificatePage() {
  const { serial } = Route.useParams();
  const { t, locale } = useI18n();
  const [cert, setCert] = useState<Certificate | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data } = await supabase
        .from("certificates")
        .select("serial,recipient_name,course_title,issued_at")
        .eq("serial", serial)
        .maybeSingle();
      if (!alive) return;
      setCert((data as Certificate) ?? null);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [serial]);

  if (loading) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background text-sm text-muted-foreground">
        {t("common.loading")}
      </main>
    );
  }

  if (!cert) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <p className="text-4xl">🔎</p>
        <h1 className="text-lg font-bold">{t("certificate.notFound")}</h1>
        <p className="text-xs text-muted-foreground">{t("certificate.serial", { serial })}</p>
        <Link to="/courses" className="mt-2 text-sm text-primary">
          {t("courses.title")}
        </Link>
      </main>
    );
  }

  const issued = new Date(cert.issued_at).toLocaleDateString(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-10">
      {/* Le certificat est une page publique : n'importe qui peut vérifier une
          série sans compte, d'où l'absence de coquille applicative. */}
      <article className="w-full max-w-2xl rounded-3xl border border-primary/40 bg-surface p-8 text-center shadow-lg md:p-12 print:border-black print:shadow-none">
        <div className="flex items-center justify-center gap-2">
          <BrandLogo className="h-11" />
        </div>

        <Award className="mx-auto mt-6 h-12 w-12 text-primary" />
        <h1 className="mt-3 text-xl font-black uppercase tracking-[0.2em] text-muted-foreground">
          {t("certificate.title")}
        </h1>

        <p className="mt-8 text-xs uppercase tracking-widest text-muted-foreground">
          {t("certificate.awardedTo")}
        </p>
        <p className="mt-2 text-3xl font-black text-gradient-brand md:text-4xl">
          {cert.recipient_name}
        </p>

        <p className="mt-6 text-xs uppercase tracking-widest text-muted-foreground">
          {t("certificate.forCourse")}
        </p>
        <p className="mt-2 text-lg font-bold">{cert.course_title}</p>

        <div className="mt-10 flex flex-col items-center gap-1 text-[11px] text-muted-foreground">
          <span>{t("certificate.issuedOn", { date: issued })}</span>
          <span className="font-bold tabular">
            {t("certificate.serial", { serial: cert.serial })}
          </span>
          <span>
            {t("certificate.verify")} /certificates/{cert.serial}
          </span>
        </div>
      </article>

      <button
        type="button"
        onClick={() => window.print()}
        className="mt-6 flex items-center gap-2 rounded-full border border-border bg-surface-2 px-5 py-2.5 text-sm font-semibold print:hidden"
      >
        <Printer className="h-4 w-4" /> {t("certificate.print")}
      </button>
    </main>
  );
}
