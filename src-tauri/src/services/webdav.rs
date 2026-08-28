//! WebDAV 同步模块（适配 fastnote 纯 .md 文件存储）
//!
//! 设计：
//! - 同步对象：`metadata.json` + `notes/` 目录下的全部笔记 .md 文件
//! - 双向同步：本地与远端单文件 `fastnote.json` 按文件路径 + 修改时间合并
//!   （last-write-wins），避免多设备互相覆盖丢数据
//! - 「手动恢复」：拉取远端包覆盖本地（由前端在用户确认后调用）
//! - 兼容坚果云等任何标准 WebDAV 网盘；密码使用 aes-gcm 随机 nonce 加密后
//!   存入 `<config_dir>/webdav.json`（非明文）
//! - 后台定时同步：启用后每 5 分钟自动双向同步一次

use std::{
    collections::HashMap,
    fs,
    path::{Component, Path, PathBuf},
    time::Duration,
};

use aes_gcm::{aead::{Aead, KeyInit}, Aes256Gcm, Nonce};
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use crate::{json_io::write_json_atomic, services::notes::default_store};

/// 远端同步文件名（存于用户配置的 remotePath 目录下，默认 /fastnote/fastnote.json）
const DEFAULT_REMOTE_PATH: &str = "/fastnote/fastnote.json";

/// 后台定时同步间隔（秒）
const SYNC_POLL_INTERVAL_SECS: u64 = 300;

/// 简单加密密钥派生：固定 salt + 应用标识（设备级弱密钥，仅防明文泄漏）
const ENC_KEY_SALT: &[u8] = b"fastnote-webdav-salt";
/// AES-GCM nonce 长度必须为 12 字节
const ENC_NONCE_LEN: usize = 12;

// ──────────────── 同步数据模型 ────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
struct SyncNoteFile {
    /// 相对 data_dir 的路径，如 "metadata.json" 或 "notes/工作/x.md"
    path: String,
    content: String,
    /// 本地修改时间（毫秒），用于合并时 last-write-wins
    mtime_ms: i64,
}

#[derive(Serialize, Deserialize, Debug)]
struct SyncFile {
    version: u32,
    updated_at: i64,
    files: Vec<SyncNoteFile>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct WebdavStatus {
    pub enabled: bool,
    pub last_sync: i64,
}

/// WebDAV 配置（存于 `<config_dir>/webdav.json`，密码加密）
#[derive(Serialize, Deserialize, Clone, Default)]
struct WebdavConfigFile {
    #[serde(default)]
    enabled: bool,
    #[serde(default)]
    url: String,
    #[serde(default)]
    user: String,
    /// 加密后的密码（aes-gcm），空表示未设置
    #[serde(default)]
    pass_enc: String,
    #[serde(default)]
    remote_path: String,
    #[serde(default)]
    last_sync: i64,
}

// ──────────────── 配置读写 ────────────────

fn webdav_config_path() -> Result<PathBuf, String> {
    let store = default_store().map_err(|e| format!("获取数据目录失败: {e}"))?;
    Ok(store.config_dir().join("webdav.json"))
}

fn load_config() -> Result<WebdavConfigFile, String> {
    let path = webdav_config_path()?;
    if !path.exists() {
        return Ok(WebdavConfigFile {
            remote_path: DEFAULT_REMOTE_PATH.to_string(),
            ..Default::default()
        });
    }
    let raw = fs::read_to_string(&path).map_err(|e| format!("读取 WebDAV 配置失败: {e}"))?;
    serde_json::from_str(&raw).map_err(|e| format!("解析 WebDAV 配置失败: {e}"))
}

fn save_config(config: &WebdavConfigFile) -> Result<(), String> {
    let path = webdav_config_path()?;
    write_json_atomic(&path, config).map_err(|e| format!("保存 WebDAV 配置失败: {e}"))
}

/// 当前时间戳（毫秒）
fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64
}

// ──────────────── 加密（密码存储用） ────────────────

fn derive_key() -> [u8; 32] {
    // 简单派生：固定 salt + 固定串，取前 32 字节。仅用于「不落明文」，非高安全场景。
    use std::io::Write;
    let mut data = Vec::new();
    let _ = data.write_all(b"fastnote-webdav-secret");
    let _ = data.write_all(ENC_KEY_SALT);
    let mut key = [0u8; 32];
    for (i, b) in data.iter().cycle().take(32).enumerate() {
        key[i] = *b;
    }
    key
}

fn encrypt_secret(plain: &str) -> Result<String, String> {
    let cipher =
        Aes256Gcm::new_from_slice(&derive_key()).map_err(|e| format!("加密初始化失败: {e}"))?;
    let mut nonce_bytes = [0u8; ENC_NONCE_LEN];
    use rand::RngCore;
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let mut ciphertext = cipher
        .encrypt(nonce, plain.as_bytes())
        .map_err(|e| format!("加密失败: {e}"))?;
    let mut out = Vec::with_capacity(ENC_NONCE_LEN + ciphertext.len());
    out.extend_from_slice(&nonce_bytes);
    out.append(&mut ciphertext);
    Ok(B64.encode(out))
}

fn decrypt_secret(cipher_b64: &str) -> Result<String, String> {
    let cipher =
        Aes256Gcm::new_from_slice(&derive_key()).map_err(|e| format!("解密初始化失败: {e}"))?;
    let bytes = B64.decode(cipher_b64).map_err(|e| format!("密文解码失败: {e}"))?;
    if bytes.len() < ENC_NONCE_LEN {
        return Err("密文长度不足（缺少 nonce）".to_string());
    }
    let (nonce_bytes, ciphertext) = bytes.split_at(ENC_NONCE_LEN);
    let nonce = Nonce::from_slice(nonce_bytes);
    let plain = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| "密码解密失败（可能已损坏）".to_string())?;
    String::from_utf8(plain).map_err(|e| format!("密码编码失败: {e}"))
}

// ──────────────── WebDAV 客户端 ────────────────

fn build_client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(30))
        // 坚果云等使用有效 SSL 证书；此处不跳过校验
        .build()
        .map_err(|e| format!("HTTP 客户端创建失败: {e}"))
}

/// 确保远端目录存在（逐级 MKCOL）。remote_path 形如 /fastnote/fastnote.json
fn ensure_remote_dir(
    client: &reqwest::blocking::Client,
    base: &str,
    auth: &reqwest::header::HeaderValue,
    remote_path: &str,
) -> Result<(), String> {
    let dir = match remote_path.trim_start_matches('/').rsplit_once('/') {
        Some((d, _)) if !d.is_empty() => d.to_string(),
        _ => return Ok(()),
    };
    let base = base.trim_end_matches('/');
    let mut cur = base.to_string();
    for seg in dir.split('/') {
        if seg.is_empty() {
            continue;
        }
        cur.push('/');
        cur.push_str(seg);
        let mkcol = http::Method::from_bytes(b"MKCOL")
            .map_err(|e| format!("构造 MKCOL 方法失败: {e}"))?;
        let resp = client
            .request(mkcol, &cur)
            .header(reqwest::header::AUTHORIZATION, auth.clone())
            .send();
        match resp {
            Ok(r) => {
                let s = r.status();
                // 201 创建成功；405/409 已存在，可接受
                if !s.is_success() && s.as_u16() != 405 && s.as_u16() != 409 {
                    eprintln!("[webdav] MKCOL {} -> {}", cur, s);
                }
            }
            Err(e) => eprintln!("[webdav] MKCOL {} 请求失败: {}", cur, e),
        }
    }
    Ok(())
}

fn normalize_remote_url(base: &str, remote_path: &str) -> String {
    let base = base.trim_end_matches('/');
    let rp = remote_path.trim_start_matches('/');
    format!("{base}/{rp}")
}

fn basic_auth_header(user: &str, pass: &str) -> Result<reqwest::header::HeaderValue, String> {
    let raw = format!("{}:{}", user, pass);
    let encoded = B64.encode(raw);
    reqwest::header::HeaderValue::from_str(&format!("Basic {encoded}"))
        .map_err(|e| format!("认证头构造失败: {e}"))
}

// ──────────────── 本地数据收集 / 写入 ────────────────

fn file_modified_ms(path: &Path) -> i64 {
    fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// 收集本地同步对象：metadata.json + notes/ 下全部普通文件
fn collect_local_files(data_dir: &Path) -> Result<Vec<SyncNoteFile>, String> {
    let mut files = Vec::new();

    let meta = data_dir.join("metadata.json");
    if meta.is_file() {
        let content =
            fs::read_to_string(&meta).map_err(|e| format!("读取 metadata.json 失败: {e}"))?;
        files.push(SyncNoteFile {
            path: "metadata.json".to_string(),
            content,
            mtime_ms: file_modified_ms(&meta),
        });
    }

    let notes_dir = data_dir.join("notes");
    if notes_dir.is_dir() {
        collect_dir_files(&notes_dir, &notes_dir, &mut files)?;
    }

    Ok(files)
}

fn collect_dir_files(
    root: &Path,
    dir: &Path,
    out: &mut Vec<SyncNoteFile>,
) -> Result<(), String> {
    let entries = fs::read_dir(dir).map_err(|e| format!("读取目录失败 {dir:?}: {e}"))?;
    for entry in entries {
        let entry = entry.map_err(|e| format!("读取目录项失败: {e}"))?;
        let p = entry.path();
        let rel = p
            .strip_prefix(root)
            .map_err(|e| format!("路径解析失败: {e}"))?
            .to_string_lossy()
            .replace('\\', "/");
        if p.is_dir() {
            collect_dir_files(root, &p, out)?;
        } else if p.is_file() {
            let content =
                fs::read_to_string(&p).map_err(|e| format!("读取文件失败 {p:?}: {e}"))?;
            out.push(SyncNoteFile {
                path: format!("notes/{rel}"),
                content,
                mtime_ms: file_modified_ms(&p),
            });
        }
    }
    Ok(())
}

/// 校验远端文件路径合法：相对路径、不含 `..`、限定在 metadata.json 与 notes/ 下
fn is_safe_sync_path(path: &str) -> bool {
    let path = path.replace('\\', "/");
    if path == "metadata.json" {
        return true;
    }
    if let Some(rest) = path.strip_prefix("notes/") {
        if rest.is_empty() {
            return false;
        }
        let mut components = Path::new(rest).components();
        return components.all(|c| matches!(c, Component::Normal(_)));
    }
    false
}

/// 用远端数据覆盖本地（手动恢复）
fn overwrite_local_files(data_dir: &Path, sync: &SyncFile) -> Result<(), String> {
    let notes_dir = data_dir.join("notes");
    if notes_dir.exists() {
        fs::remove_dir_all(&notes_dir).map_err(|e| format!("清空 notes 目录失败: {e}"))?;
    }
    fs::create_dir_all(&notes_dir).map_err(|e| format!("创建 notes 目录失败: {e}"))?;

    for file in &sync.files {
        if !is_safe_sync_path(&file.path) {
            eprintln!("[webdav] 跳过不合法路径: {}", file.path);
            continue;
        }
        let full = data_dir.join(&file.path);
        if let Some(parent) = full.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("创建目录失败 {parent:?}: {e}"))?;
        }
        fs::write(&full, &file.content).map_err(|e| format!("写入文件失败 {full:?}: {e}"))?;
    }

    Ok(())
}

// ──────────────── 核心同步逻辑 ────────────────

/// 可选的配置覆盖（来自当前输入框的临时值，优先于已保存配置）
struct ConfigOverride {
    url: Option<String>,
    user: Option<String>,
    pass: Option<String>,
    remote_path: Option<String>,
}

fn get_effective_config(
    ov: Option<&ConfigOverride>,
) -> Result<(String, String, String, String, bool), String> {
    let cfg = load_config()?;
    if !cfg.enabled {
        return Err("WebDAV 同步未启用".into());
    }
    let url = ov
        .and_then(|o| o.url.clone())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| cfg.url.clone());
    let user = ov
        .and_then(|o| o.user.clone())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| cfg.user.clone());
    // 优先用传入的明文密码；否则回退已保存（加密）的密码
    let pass = if let Some(p) = ov.and_then(|o| o.pass.clone()).filter(|s| !s.is_empty()) {
        p
    } else if !cfg.pass_enc.is_empty() {
        decrypt_secret(&cfg.pass_enc)?
    } else {
        return Err("WebDAV 配置不完整，请先在设置中填写服务器地址、账号和密码".into());
    };
    let remote_path = ov
        .and_then(|o| o.remote_path.clone())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| {
            if cfg.remote_path.is_empty() {
                DEFAULT_REMOTE_PATH.to_string()
            } else {
                cfg.remote_path.clone()
            }
        });

    if url.is_empty() || user.is_empty() {
        return Err("WebDAV 配置不完整，请先在设置中填写服务器地址、账号和密码".into());
    }

    Ok((url, user, pass, remote_path, cfg.enabled))
}

/// 本地与远端按文件路径合并（last-write-wins：mtime 较大者为准）
fn merge_files(local: Vec<SyncNoteFile>, remote: Vec<SyncNoteFile>) -> Vec<SyncNoteFile> {
    let mut map: HashMap<String, SyncNoteFile> = HashMap::new();
    for f in local {
        map.insert(f.path.clone(), f);
    }
    for r in remote {
        match map.get(&r.path) {
            Some(l) if l.mtime_ms >= r.mtime_ms => { /* 本地较新，保留本地 */ }
            _ => {
                map.insert(r.path.clone(), r);
            }
        }
    }
    let mut merged: Vec<SyncNoteFile> = map.into_values().collect();
    merged.sort_by(|a, b| a.path.cmp(&b.path));
    merged
}

fn sync_to_webdav(ov: Option<&ConfigOverride>) -> Result<(), String> {
    let (url, user, pass, remote_path, _enabled) = get_effective_config(ov)?;
    let store = default_store().map_err(|e| format!("获取数据目录失败: {e}"))?;
    let data_dir = store.data_dir().to_path_buf();

    let client = build_client()?;
    let auth = basic_auth_header(&user, &pass)?;
    let full = normalize_remote_url(&url, &remote_path);

    let local = collect_local_files(&data_dir)?;

    // 先确保远端父目录存在：坚果云对「父目录不存在」的资源请求会返回 409
    ensure_remote_dir(&client, &url, &auth, &remote_path)?;

    // 尝试拉取远端
    let remote_files = match client
        .get(&full)
        .header(reqwest::header::AUTHORIZATION, auth.clone())
        .send()
    {
        Ok(resp) if resp.status().is_success() => {
            let body = resp.text().map_err(|e| format!("读取响应失败: {e}"))?;
            match serde_json::from_str::<SyncFile>(&body) {
                Ok(sf) => {
                    eprintln!("[webdav] sync: 拉取远端 {} 条", sf.files.len());
                    sf.files
                }
                Err(e) => {
                    eprintln!("[webdav] sync: 远端数据解析失败，视为空: {e}");
                    Vec::new()
                }
            }
        }
        // 404（文件不存在）与 409（坚果云对缺失资源可能返回 409）都视为远端无文件
        Ok(resp) if resp.status().as_u16() == 404 || resp.status().as_u16() == 409 => {
            eprintln!("[webdav] sync: 远端文件不存在（{}），将直接上传本地", resp.status());
            Vec::new()
        }
        Ok(resp) => {
            return Err(format!("下载失败，服务器返回 {}", resp.status()));
        }
        Err(e) => return Err(format!("下载请求失败: {e}")),
    };

    let merged = merge_files(local, remote_files);

    // 写回本地（合并结果）
    overwrite_local_files(
        &data_dir,
        &SyncFile {
            version: 1,
            updated_at: now_ms(),
            files: merged.clone(),
        },
    )?;

    // 上传合并结果到云端
    ensure_remote_dir(&client, &url, &auth, &remote_path)?;
    let body = serde_json::to_string(&SyncFile {
        version: 1,
        updated_at: now_ms(),
        files: merged,
    })
    .map_err(|e| format!("序列化失败: {e}"))?;

    eprintln!("[webdav] sync: PUT {}", full);
    let resp = client
        .put(&full)
        .header(reqwest::header::AUTHORIZATION, auth.clone())
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .body(body)
        .send()
        .map_err(|e| format!("上传请求失败: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("上传失败，服务器返回 {}", resp.status()));
    }

    set_last_sync(now_ms())?;
    Ok(())
}

/// 从 WebDAV 下载并覆盖本地（手动恢复，危险操作，仅在用户确认后调用）
fn download_from_webdav(app: &AppHandle, ov: Option<&ConfigOverride>) -> Result<(), String> {
    let (url, user, pass, remote_path, _enabled) = get_effective_config(ov)?;
    let store = default_store().map_err(|e| format!("获取数据目录失败: {e}"))?;
    let data_dir = store.data_dir().to_path_buf();

    let client = build_client()?;
    let auth = basic_auth_header(&user, &pass)?;
    let full = normalize_remote_url(&url, &remote_path);

    let resp = client
        .get(&full)
        .header(reqwest::header::AUTHORIZATION, auth.clone())
        .send()
        .map_err(|e| format!("下载请求失败: {e}"))?;

    if !resp.status().is_success() {
        if resp.status().as_u16() == 404 || resp.status().as_u16() == 409 {
            return Err("远端文件不存在，请先执行「立即同步」".into());
        }
        return Err(format!("下载失败，服务器返回 {}", resp.status()));
    }

    let body = resp.text().map_err(|e| format!("读取响应失败: {e}"))?;
    let sync_file: SyncFile =
        serde_json::from_str(&body).map_err(|e| format!("解析远端数据失败: {e}"))?;

    overwrite_local_files(&data_dir, &sync_file)?;
    set_last_sync(now_ms())?;

    // 通知前端刷新笔记列表
    let _ = app.emit("notes-changed", ());
    Ok(())
}

fn set_last_sync(ts: i64) -> Result<(), String> {
    let mut cfg = load_config()?;
    cfg.last_sync = ts;
    save_config(&cfg)
}

// ──────────────── 后台定时同步 ────────────────

/// 后台定时双向同步（仅 enabled 时执行）
fn sync_tick() {
    let enabled = load_config().map(|c| c.enabled).unwrap_or(false);
    if !enabled {
        return;
    }
    if let Err(e) = sync_to_webdav(None) {
        eprintln!("[fastnote] WebDAV 后台同步失败: {e}");
    }
}

/// 启动 Rust 端后台同步轮询（异步运行时内循环，仅在启用时执行同步）
pub fn start_webdav_sync_poll(_app: &AppHandle) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_secs(10)).await;

        let mut interval = tokio::time::interval(Duration::from_secs(SYNC_POLL_INTERVAL_SECS));
        interval.tick().await; // 跳过首个即时 tick

        loop {
            interval.tick().await;
            if !load_config().map(|c| c.enabled).unwrap_or(false) {
                continue;
            }
            let _ = tokio::task::spawn_blocking(sync_tick).await;
        }
    });
}

// ──────────────── Tauri Commands ────────────────

#[derive(Serialize, Deserialize)]
pub struct WebdavConfigPayload {
    pub enabled: Option<bool>,
    pub url: Option<String>,
    pub user: Option<String>,
    pub pass: Option<String>,
    pub remote_path: Option<String>,
}

/// 设置 WebDAV 配置（密码加密存储；空密码表示不修改已保存密码）
#[tauri::command]
pub async fn webdav_set_config(config: WebdavConfigPayload) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut cfg = load_config()?;
        if let Some(enabled) = config.enabled {
            cfg.enabled = enabled;
        }
        if let Some(url) = config.url {
            cfg.url = url;
        }
        if let Some(user) = config.user {
            cfg.user = user;
        }
        if let Some(pass) = config.pass {
            if !pass.is_empty() {
                cfg.pass_enc = encrypt_secret(&pass)?;
            }
        }
        if let Some(remote_path) = config.remote_path {
            cfg.remote_path = if remote_path.trim().is_empty() {
                DEFAULT_REMOTE_PATH.to_string()
            } else {
                remote_path
            };
        }
        save_config(&cfg)
    })
    .await
    .map_err(|e| format!("后台任务失败: {e}"))?
}

/// 获取当前配置（密码仅返回是否已设置，不回填明文）
#[tauri::command]
pub async fn webdav_get_config() -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let cfg = load_config()?;
        let has_password = !cfg.pass_enc.is_empty();
        Ok(serde_json::json!({
            "enabled": cfg.enabled,
            "url": cfg.url,
            "user": cfg.user,
            "hasPassword": has_password,
            "remotePath": if cfg.remote_path.is_empty() { DEFAULT_REMOTE_PATH } else { cfg.remote_path.as_str() },
            "lastSync": cfg.last_sync,
        }))
    })
    .await
    .map_err(|e| format!("后台任务失败: {e}"))?
}

/// 测试连接请求参数（使用当前输入框的临时值，不依赖已保存配置）
#[derive(Serialize, Deserialize)]
pub struct WebdavTestPayload {
    pub url: String,
    pub user: String,
    pub pass: String,
    pub remote_path: Option<String>,
}

/// 测试连接（PROPFIND 根目录）
#[tauri::command]
pub async fn webdav_test(payload: WebdavTestPayload) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let url = payload.url.trim();
        let user = payload.user.trim();
        let mut pass = payload.pass;
        if pass.is_empty() {
            let saved = load_config()?.pass_enc;
            if !saved.is_empty() {
                pass = decrypt_secret(&saved)?;
            }
        }
        if url.is_empty() || user.is_empty() || pass.is_empty() {
            return Err("请先填写服务器地址、账号和密码".into());
        }
        let client = build_client()?;
        let auth = basic_auth_header(&user, &pass)?;
        let root = url.trim_end_matches('/').to_string();
        eprintln!("[webdav] test: PROPFIND {}", root);
        let propfind = http::Method::from_bytes(b"PROPFIND")
            .map_err(|e| format!("构造 PROPFIND 方法失败: {e}"))?;
        let resp = client
            .request(propfind, &root)
            .header(reqwest::header::AUTHORIZATION, auth)
            .header("Depth", "0")
            .send()
            .map_err(|e| format!("连接测试失败: {e}"))?;
        eprintln!("[webdav] test: 状态码 {}", resp.status());
        if resp.status().is_success() || resp.status().as_u16() == 207 {
            Ok("连接成功".into())
        } else {
            Err(format!("连接失败，服务器返回 {}", resp.status()))
        }
    })
    .await
    .map_err(|e| format!("后台任务失败: {e}"))?
}

/// 立即双向同步（合并本地与远端，结果同时写回本地并上传云端）
#[tauri::command]
pub async fn webdav_sync_now(
    app: AppHandle,
    payload: Option<WebdavTestPayload>,
) -> Result<String, String> {
    let ov = payload.map(|p| ConfigOverride {
        url: Some(p.url),
        user: Some(p.user),
        pass: Some(p.pass),
        remote_path: p.remote_path,
    });
    tauri::async_runtime::spawn_blocking(move || match sync_to_webdav(ov.as_ref()) {
        Ok(_) => {
            let _ = app.emit("notes-changed", ());
            Ok("同步成功".into())
        }
        Err(e) => Err(e),
    })
    .await
    .map_err(|e| format!("后台任务失败: {e}"))?
}

/// 从云端恢复（下载覆盖本地，危险操作）
#[tauri::command]
pub async fn webdav_restore(
    app: AppHandle,
    payload: Option<WebdavTestPayload>,
) -> Result<String, String> {
    let ov = payload.map(|p| ConfigOverride {
        url: Some(p.url),
        user: Some(p.user),
        pass: Some(p.pass),
        remote_path: p.remote_path,
    });
    tauri::async_runtime::spawn_blocking(move || match download_from_webdav(&app, ov.as_ref()) {
        Ok(_) => Ok("已从云端恢复".to_string()),
        Err(e) => Err(e),
    })
    .await
    .map_err(|e| format!("后台任务失败: {e}"))?
}

/// 读取同步状态
#[tauri::command]
pub async fn webdav_status() -> Result<WebdavStatus, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let cfg = load_config()?;
        Ok(WebdavStatus {
            enabled: cfg.enabled,
            last_sync: cfg.last_sync,
        })
    })
    .await
    .map_err(|e| format!("后台任务失败: {e}"))?
}
