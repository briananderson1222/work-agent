fn main() {
    let result = tauri_plugin::Builder::new(&["discover"])
        .android_path("android")
        .try_build();

    if let Err(error) = result {
        println!("cargo:warning=tauri-plugin-stallion-mdns build: {error}");
    }
}
