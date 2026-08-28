import { useEffect, type ReactNode } from "react";
import { getUserLang, initUserLang, setUserLang, isSupportedLang } from "@/lib/authI18n";

interface TranslationWrapperProps {
  children: ReactNode;
}

/**
 * Keeps <html lang/dir> in sync with the selected language.
 *
 * The app ships exactly two languages (English + Egyptian Arabic) and every
 * string lives in `src/lib/authI18n.ts`, so there is no dictionary download,
 * no DOM walking and no runtime translation cost here.
 */
const TranslationWrapper = ({ children }: TranslationWrapperProps) => {
  useEffect(() => {
    // A `/ar-eg` or `/en` route prefix wins over the stored preference.
    const routeLang = window.location.pathname.split("/").filter(Boolean)[0]?.toLowerCase();
    if (routeLang && isSupportedLang(routeLang) && routeLang !== getUserLang()) {
      void setUserLang(routeLang, { syncRemote: false });
    } else {
      void initUserLang();
    }
  }, []);

  return <>{children}</>;
};

export default TranslationWrapper;
