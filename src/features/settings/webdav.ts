import { invoke } from "@tauri-apps/api/core";

export interface WebdavConfig {
  enabled: boolean;
  url: string;
  user: string;
  /** 是否已保存密码（不回填明文） */
  hasPassword: boolean;
  remotePath: string;
  lastSync: number;
}

export interface WebdavStatus {
  enabled: boolean;
  lastSync: number;
}

export interface WebdavInput {
  url: string;
  user: string;
  pass: string;
  remotePath?: string;
}

/** 保存 WebDAV 配置。密码为空字符串表示不修改已保存的密码。 */
export async function webdavSetConfig(cfg: {
  enabled?: boolean;
  url?: string;
  user?: string;
  pass?: string;
  remotePath?: string;
}): Promise<void> {
  await invoke("webdav_set_config", { config: cfg });
}

/** 读取当前 WebDAV 配置（密码仅返回是否已设置）。 */
export async function webdavGetConfig(): Promise<WebdavConfig> {
  return await invoke<WebdavConfig>("webdav_get_config");
}

/** 测试连接。使用当前输入框的临时配置，成功返回提示文本，失败抛错。 */
export async function webdavTest(input: WebdavInput): Promise<string> {
  return await invoke<string>("webdav_test", { payload: input });
}

/** 立即双向同步（合并本地与远端）。可传入当前输入框的临时配置。 */
export async function webdavSyncNow(input: WebdavInput): Promise<string> {
  return await invoke<string>("webdav_sync_now", { payload: input });
}

/** 从云端恢复（下载覆盖本地，危险操作）。可传入当前输入框的临时配置。 */
export async function webdavRestore(input: WebdavInput): Promise<string> {
  return await invoke<string>("webdav_restore", { payload: input });
}

/** 读取同步状态。 */
export async function webdavStatus(): Promise<WebdavStatus> {
  return await invoke<WebdavStatus>("webdav_status");
}
