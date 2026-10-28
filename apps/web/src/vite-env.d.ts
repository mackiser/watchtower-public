/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Demo sign-in hint shown on the login page (set only for the public read-only demo build). */
  readonly VITE_DEMO_EMAIL?: string;
  readonly VITE_DEMO_PASSWORD?: string;
}
