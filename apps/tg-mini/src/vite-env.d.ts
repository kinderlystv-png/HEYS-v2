/// <reference types="vite/client" />

declare global {
  interface ImportMetaEnv {
    readonly VITE_USE_CLIENT_MOCKS?: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}
