// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

/// Where the native audio engine RPC will live: the real Rust engine (stems,
/// pads, transport, key variants) replaces the panel's in-process MockEngine
/// here, exposed over the same EngineCommand/EngineState contract
/// (@laude/laudj-control-protocol) via Tauri commands/events or a LAN
/// WebSocket for remote tablets.
#[tauri::command]
fn engine_status() -> &'static str {
    "mock"
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![engine_status])
        .run(tauri::generate_context!())
        .expect("error while running LauDJ");
}
