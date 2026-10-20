// Builds the embedded JS bundle (js/dist/bundle.js) that src/hid.rs runs in
// QuickJS. It is generated from @openmouse/protocol and src/native-hid in the
// repo root, so it needs the root `npm install` to have been run.

use std::path::Path;
use std::process::Command;

fn main() {
    // 16 MiB main-thread stack (Windows default is 1 MiB): a debug build of the
    // device page (dozens of controls in nested flex rows) overflows 1 MiB.
    println!("cargo:rustc-link-arg-bins=/STACK:16777216");
    println!("cargo:rerun-if-changed=js");
    println!("cargo:rerun-if-changed=js/build.mjs");
    println!("cargo:rerun-if-changed=js/shims");
    println!("cargo:rerun-if-changed=../src/native-hid");
    println!("cargo:rerun-if-changed=../src/lib/changelog.ts");
    println!("cargo:rerun-if-changed=../node_modules/@openmouse/protocol/dist");

    if !Path::new("../node_modules/esbuild").exists() {
        panic!("gpui: run `npm install` in the repo root first (esbuild builds the embedded protocol bundle)");
    }
    let status = Command::new("node")
        .arg("js/build.mjs")
        .status()
        .expect("gpui: could not run `node js/build.mjs` (is Node installed?)");
    assert!(status.success(), "gpui: js/build.mjs failed");

    // openmouse-gpui.exe shipped with no icon/version resource at all until
    // now; reuses the same source art as the Tauri build's bundler.
    #[cfg(windows)]
    {
        let mut res = winres::WindowsResource::new();
        res.set_icon("../src-tauri/icons/icon.ico");
        if let Err(error) = res.compile() {
            println!("cargo:warning=could not embed the app icon: {error}");
        }
    }
}
