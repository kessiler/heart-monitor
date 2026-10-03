#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::webview::{NewWindowResponse, PermissionKind, PermissionResponse, WebviewWindowBuilder};

fn allowed_reference(url: &tauri::Url) -> bool {
    url.scheme() == "https"
        && url.username().is_empty()
        && url.password().is_none()
        && url.port_or_known_default() == Some(443)
        && matches!(
            url.host_str(),
            Some(
                "github.com"
                    | "kessiler.github.io"
                    | "doi.org"
                    | "revistas.unibh.br"
                    | "people.csail.mit.edu"
                    | "www.researchgate.net"
            )
        )
}

fn main() {
    // The frontend uses the same pulse-core algorithm through its bundled Wasm.
    // No Rust commands, filesystem access, or remote services are exposed.
    tauri::Builder::default()
        .setup(|app| {
            let window = WebviewWindowBuilder::from_config(app, &app.config().app.windows[0])?
                .on_navigation(|url| {
                    let bundled = (url.scheme() == "tauri" && url.host_str() == Some("localhost"))
                        || (url.scheme() == "https" && url.host_str() == Some("tauri.localhost"));
                    let development = cfg!(debug_assertions)
                        && url.scheme() == "http"
                        && url.host_str() == Some("127.0.0.1")
                        && url.port() == Some(5173);
                    bundled || development
                })
                .on_new_window(|url, _| {
                    if !allowed_reference(&url) {
                        return NewWindowResponse::Deny;
                    }
                    // Use only the native Rust API; no opener IPC permissions are granted.
                    if tauri_plugin_opener::open_url(url.as_str(), None::<&str>).is_err() {
                        eprintln!("could not open the reference in the system browser");
                    }
                    NewWindowResponse::Deny
                })
                .on_permission_request(|_, permission| match permission {
                    // The user starts capture in the UI; OS camera consent still applies.
                    PermissionKind::Camera => PermissionResponse::Allow,
                    _ => PermissionResponse::Deny,
                })
                .build()?;
            // WebKitGTK disables media streams by default. Enable local video capture.
            #[cfg(target_os = "linux")]
            window.with_webview(|webview| {
                use webkit2gtk::{SettingsExt, WebViewExt};
                if let Some(settings) = webview.inner().settings() {
                    settings.set_enable_media_stream(true);
                }
            })?;
            #[cfg(not(target_os = "linux"))]
            let _ = window;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("could not start Heart Monitor");
}

#[cfg(test)]
mod tests {
    use super::allowed_reference;
    use tauri::Url;

    #[test]
    fn accepts_the_public_research_and_project_references() {
        for reference in [
            "https://github.com/kessiler/heart-monitor",
            "https://kessiler.github.io/heart-monitor/",
            "https://doi.org/10.18674/exacta.v9i1.1666",
            "https://revistas.unibh.br/dcet/article/view/1666",
            "https://people.csail.mit.edu/mrub/evm/",
            "https://www.researchgate.net/publication/303794403",
        ] {
            assert!(
                allowed_reference(&Url::parse(reference).unwrap()),
                "{reference}"
            );
        }
    }

    #[test]
    fn rejects_arbitrary_domains_credentials_and_non_https_targets() {
        for reference in [
            "https://example.com/",
            "https://github.com.example.com/",
            "https://github.com@evil.example/",
            "https://user:password@github.com/",
            "https://github.com:8443/",
            "http://github.com/kessiler/heart-monitor",
            "file:///etc/passwd",
            "javascript:alert(1)",
            "tauri://localhost/index.html",
        ] {
            assert!(
                !allowed_reference(&Url::parse(reference).unwrap()),
                "{reference}"
            );
        }
    }
}
