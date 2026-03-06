use tauri::{
    plugin::{Builder, TauriPlugin},
    Runtime,
};

/// Android package identifier for the Kotlin plugin class.
#[cfg(target_os = "android")]
const PLUGIN_IDENTIFIER: &str = "xyz.briananderson.stallion.mdns";

/// Initialise the mDNS discovery plugin.
///
/// On Android this registers `MdnsPlugin.kt` (NsdManager wrapper) so that
/// JavaScript `invoke('plugin:stallion-mdns|discover')` calls reach Kotlin
/// directly.  On other platforms the plugin is a no-op stub.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("stallion-mdns")
        .setup(|_app, api| {
            #[cfg(target_os = "android")]
            api.register_android_plugin(PLUGIN_IDENTIFIER, "MdnsPlugin")?;
            let _ = api;
            Ok(())
        })
        .build()
}
