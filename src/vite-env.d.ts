/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_BETSAPI_TOKEN?: string;
  readonly VITE_BETSAPI_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
