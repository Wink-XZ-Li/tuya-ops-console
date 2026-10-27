/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEMO_MODE?: string;
  /** 仅本地演示，覆盖访客一键登录用户名。 */
  readonly VITE_GUEST_USERNAME?: string;
  /** 仅本地演示，覆盖访客一键登录密码。 */
  readonly VITE_GUEST_PASSWORD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
