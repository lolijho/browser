/**
 * Package UI: conterrà i componenti condivisi (Tailwind + Radix/shadcn)
 * della shell browser e della sidebar (fasi 01-02).
 *
 * In fase 00 espone solo i token di tema stabili.
 */

export type ThemeMode = "light" | "dark" | "system";

export const DEFAULT_THEME_MODE: ThemeMode = "system";
