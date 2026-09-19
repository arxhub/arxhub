#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init());
    #[cfg(target_os = "android")]
    let builder = builder.plugin(tauri_plugin_geolocation::init());
    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
