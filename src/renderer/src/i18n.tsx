import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import spanish from "./es.json";
export type Language = "en" | "es";
export function translate(
  language: Language,
  text: string,
  ...values: (string | number)[]
) {
  const template =
    language === "es"
      ? ((spanish as Record<string, string>)[text] ?? text)
      : text;
  return template.replace(/\{(\d+)\}/g, (match, index) =>
    String(values[Number(index)] ?? match),
  );
}
const LanguageContext = createContext({
  language: "en" as Language,
  setLanguage: (_: Language) => {},
  t: (text: string, ...values: (string | number)[]) =>
    translate("en", text, ...values),
});
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>("en");
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  return (
    <LanguageContext.Provider
      value={{
        language,
        setLanguage,
        t: (text, ...values) => translate(language, text, ...values),
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}
export const useLanguage = () => useContext(LanguageContext);
