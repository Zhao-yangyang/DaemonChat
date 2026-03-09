"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/src/i18n/navigation";
import { Button } from "@daemon/ui";

export function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("language");

  const toggle = () => {
    const next = locale === "zh" ? "en" : "zh";
    router.replace(pathname, { locale: next });
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-8 px-2 text-xs"
      onClick={toggle}
      title={locale === "zh" ? t("en") : t("zh")}
    >
      {locale === "zh" ? "EN" : "中"}
    </Button>
  );
}
