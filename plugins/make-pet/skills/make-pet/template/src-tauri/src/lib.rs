//! __PET_NAME__'s app: a transparent window with the pet, __PET_NAME__'s board (a session list that opens
//! beside it), a tray icon, a show/hide shortcut, and the commands both pages call.

mod dictation;
mod stats;

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use std::time::Instant;

use serde::{Deserialize, Serialize};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, PhysicalPosition, Runtime, State, WebviewWindow};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_window_state::{AppHandleExt, StateFlags};

/// One session file as `hook/pet-hook.mjs` writes it. The id is the file name.
#[derive(Serialize, Deserialize)]
struct Session {
    #[serde(default)]
    id: String,
    state: String,
    at: f64,
    #[serde(default)]
    started: f64,
    cwd: Option<String>,
    transcript: Option<String>,
    detail: Option<String>,
}

fn sessions_dir<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    let home = app.path().home_dir().ok()?;
    Some(home.join(".claude").join("__PET_SLUG__-pet").join("sessions"))
}

/// Reads every session file. A file that cannot be parsed (mid-write, or an older format)
/// is skipped; the next poll half a second later picks it up.
#[tauri::command]
fn read_sessions(app: AppHandle) -> Vec<Session> {
    let Some(entries) = sessions_dir(&app).and_then(|dir| fs::read_dir(dir).ok()) else {
        return Vec::new();
    };
    entries
        .filter_map(|entry| {
            let path = entry.ok()?.path();
            if path.extension()? != "json" {
                return None;
            }
            let mut session: Session = serde_json::from_str(&fs::read_to_string(&path).ok()?).ok()?;
            session.id = path.file_stem()?.to_string_lossy().into_owned();
            Some(session)
        })
        .collect()
}

/// Remembers where __PET_NAME__ was dragged to, so it comes back there next launch.
#[tauri::command]
fn save_position(app: AppHandle) {
    let _ = app.save_window_state(StateFlags::POSITION);
}

#[tauri::command]
fn quit(app: AppHandle) {
    let _ = app.save_window_state(StateFlags::POSITION);
    app.exit(0);
}

/// Minutes of quiet before __PET_NAME__ falls asleep, when set with the PET_SLEEP_MINUTES
/// environment variable (the page uses 20 otherwise). Handy for checking the asleep pose.
#[tauri::command]
fn sleep_minutes() -> Option<f64> {
    std::env::var("PET_SLEEP_MINUTES").ok()?.parse().ok()
}

/// Numbers for the board from one session's transcript. Only files under
/// ~/.claude/projects are read.
#[tauri::command]
fn session_stats(app: AppHandle, cache: State<stats::Cache>, transcript: String, since: String) -> Option<stats::Stats> {
    let projects = app.path().home_dir().ok()?.join(".claude").join("projects").canonicalize().ok()?;
    let path = Path::new(&transcript).canonicalize().ok()?;
    if !path.starts_with(&projects) || path.extension()? != "jsonl" {
        return None;
    }
    cache.get(&path, &since)
}

/// When the board last hid itself, so the click on __PET_NAME__ that took its focus does not
/// open it again straight away.
#[derive(Default)]
struct Board {
    hidden_at: Mutex<Option<Instant>>,
}

#[tauri::command]
fn toggle_board(app: AppHandle, board: State<Board>) {
    let Some(window) = app.get_webview_window("board") else { return };
    if window.is_visible().unwrap_or(false) {
        let _ = window.hide();
        return;
    }
    let just_hidden = board.hidden_at.lock().ok().and_then(|t| *t).is_some_and(|t| t.elapsed().as_millis() < 300);
    if just_hidden {
        return;
    }
    place_board(&app, &window);
    let _ = window.show();
    let _ = window.set_focus();
    // The click on __PET_NAME__ that opened the board also activates __PET_NAME__'s own window a moment
    // later, which would take focus back and close the board; focusing it again once that
    // has happened keeps it in front.
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(150));
        let _ = window.set_focus();
    });
}

#[tauri::command]
fn hide_board(app: AppHandle, board: State<Board>) {
    if let Some(window) = app.get_webview_window("board") {
        let _ = window.hide();
    }
    if let Ok(mut hidden_at) = board.hidden_at.lock() {
        *hidden_at = Some(Instant::now());
    }
}

/// Puts the board beside __PET_NAME__, on whichever side has more room, bottoms lined up, kept
/// inside the screen's work area (the part the taskbar does not cover).
fn place_board<R: Runtime>(app: &AppHandle<R>, board: &WebviewWindow<R>) -> Option<()> {
    let pet = app.get_webview_window("pet")?;
    let (pos, size, board_size) = (pet.outer_position().ok()?, pet.outer_size().ok()?, board.outer_size().ok()?);
    let monitor = pet.current_monitor().ok()??;
    let area = monitor.work_area();
    let (ax, ay) = (area.position.x, area.position.y);
    let (aw, ah) = (area.size.width as i32, area.size.height as i32);
    let (pw, ph) = (size.width as i32, size.height as i32);
    let (bw, bh) = (board_size.width as i32, board_size.height as i32);
    let gap = (8.0 * monitor.scale_factor()) as i32;

    let x = if pos.x + pw / 2 > ax + aw / 2 { pos.x - bw - gap } else { pos.x + pw + gap };
    let y = pos.y + ph - bh;
    let x = x.clamp(ax, (ax + aw - bw).max(ax));
    let y = y.clamp(ay, (ay + ah - bh).max(ay));
    board.set_position(PhysicalPosition::new(x, y)).ok()
}

/// Brings the Claude desktop app to the front. No documented link opens one session, so
/// the board names the session and the user picks it in the app's sidebar.
#[tauri::command]
fn show_claude() -> Result<(), String> {
    #[cfg(windows)]
    {
        if win::focus_window("Chrome_WidgetWin_1", "Claude") {
            return Ok(());
        }
    }
    // On a Mac, `open -a` brings an app forward by name (and starts it if it is closed).
    #[cfg(target_os = "macos")]
    {
        if Command::new("open").args(["-a", "Claude"]).status().is_ok_and(|s| s.success()) {
            return Ok(());
        }
    }
    Err("Could not find the Claude app".into())
}

/// Whether the left mouse button is held right now (see `watchRelease` in `src/main.ts`).
/// None off Windows, where the page relies on its own mouseup.
#[tauri::command]
fn left_button_down() -> Option<bool> {
    #[cfg(windows)]
    return Some(win::left_button_down());
    #[cfg(not(windows))]
    None
}

/// Win32 calls for Show Claude and the click check. Windows lets a process bring another
/// window to the front only while it holds the foreground itself, which __PET_NAME__'s board does
/// right after a click; that is why Show Claude runs here and not in a helper process.
#[cfg(windows)]
mod win {
    #[link(name = "user32")]
    extern "system" {
        fn FindWindowW(class: *const u16, title: *const u16) -> isize;
        fn IsIconic(hwnd: isize) -> i32;
        fn ShowWindow(hwnd: isize, command: i32) -> i32;
        fn SetForegroundWindow(hwnd: isize) -> i32;
        fn GetAsyncKeyState(key: i32) -> i16;
    }

    const SW_RESTORE: i32 = 9;
    const VK_LBUTTON: i32 = 0x01;

    pub fn left_button_down() -> bool {
        // SAFETY: GetAsyncKeyState only reads the current key state; the top bit means "down".
        unsafe { GetAsyncKeyState(VK_LBUTTON) < 0 }
    }

    fn wide(text: &str) -> Vec<u16> {
        text.encode_utf16().chain(Some(0)).collect()
    }

    /// Finds a top-level window by class and exact title, restores it if minimised, and
    /// brings it to the front. Returns false when no such window exists.
    pub fn focus_window(class: &str, title: &str) -> bool {
        let (class, title) = (wide(class), wide(title));
        // SAFETY: both strings are NUL-terminated UTF-16 buffers that outlive the calls, and
        // the handle comes straight from FindWindowW.
        unsafe {
            let hwnd = FindWindowW(class.as_ptr(), title.as_ptr());
            if hwnd == 0 {
                return false;
            }
            if IsIconic(hwnd) != 0 {
                ShowWindow(hwnd, SW_RESTORE);
            }
            SetForegroundWindow(hwnd);
        }
        true
    }
}

/// Opens a session's folder in VS Code without going through a shell: the per-user install's
/// Code.exe on Windows, `open -a "Visual Studio Code"` on a Mac.
#[tauri::command]
fn open_in_code(app: AppHandle, path: String) -> Result<(), String> {
    // An absolute path never starts with "-", so neither Code.exe nor `open` can read it as a flag.
    if !Path::new(&path).is_absolute() || !Path::new(&path).is_dir() {
        return Err("That folder no longer exists".into());
    }
    #[cfg(windows)]
    {
        let local = app.path().local_data_dir().map_err(|e| e.to_string())?;
        let code = local.join("Programs").join("Microsoft VS Code").join("Code.exe");
        hidden(Command::new(code)).arg(&path).spawn().map(|_| ()).map_err(|e| e.to_string())
    }
    #[cfg(not(windows))]
    {
        let _ = app;
        // `open` exits with an error when no app has that name, which the button then shows.
        let opened = Command::new("open").args(["-a", "Visual Studio Code"]).arg(&path).status();
        if opened.is_ok_and(|s| s.success()) {
            Ok(())
        } else {
            Err("VS Code is not installed".into())
        }
    }
}

/// Opens the claude-cli:// link built by the board's Quick Chat box: a terminal Claude Code
/// session in the chosen folder with the prompt filled in. Claude Code's link handler never
/// sends the prompt itself; the user presses Enter there. No other link is accepted.
#[tauri::command]
fn quick_chat(app: AppHandle, url: String) -> Result<(), String> {
    if !url.starts_with("claude-cli://open?") {
        return Err("Not a Claude Code link".into());
    }
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
}

/// Whether the mic button can work: whisper.cpp and its model are in the app data folder.
#[tauri::command]
fn dictation_ready(app: AppHandle) -> bool {
    app.path().app_local_data_dir().is_ok_and(|dir| dictation::ready(&dictation::whisper_dir(&dir)))
}

#[tauri::command]
fn start_recording(dictation: State<dictation::Dictation>) -> Result<(), String> {
    dictation.start()
}

/// Stops the recording and returns its text. Runs off the main thread: whisper takes about
/// a second for a sentence.
#[tauri::command]
async fn stop_recording(app: AppHandle, dictation: State<'_, dictation::Dictation>) -> Result<String, String> {
    let clip = dictation.stop()?;
    let dir = dictation::whisper_dir(&app.path().app_local_data_dir().map_err(|e| e.to_string())?);
    dictation::transcribe(&dir, clip)
}

/// Starts a program without flashing a console window (only Windows would show one).
pub(crate) fn hidden(command: Command) -> Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let mut command = command;
        command.creation_flags(CREATE_NO_WINDOW);
        command
    }
    #[cfg(not(windows))]
    command
}

fn toggle_pet<R: Runtime>(app: &AppHandle<R>) {
    let Some(window) = app.get_webview_window("pet") else { return };
    if window.is_visible().unwrap_or(false) {
        let _ = window.hide();
    } else {
        show_pet(app);
    }
}

fn show_pet<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("pet") {
        let _ = window.show();
        let _ = window.set_always_on_top(true);
    }
}

/// The show/hide shortcut, named the way each system names its keys (Alt is Option on a Mac).
const SHOW_HIDE_KEYS: &str = if cfg!(target_os = "macos") { "Ctrl+Option+P" } else { "Ctrl+Alt+P" };

pub fn run() {
    let show_hide = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyP);

    tauri::Builder::default()
        // A second launch (say, from the Start menu while autostart already ran) shows the
        // __PET_NAME__ that is running instead of adding another pet.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_pet(app)))
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(StateFlags::POSITION)
                .with_denylist(&["board"])
                .build(),
        )
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    if shortcut == &show_hide && event.state() == ShortcutState::Pressed {
                        toggle_pet(app);
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .setup(move |app| {
            // On a Mac, __PET_NAME__ is a menu-bar app: no Dock icon and not in Cmd+Tab. The tray
            // icon below becomes its menu-bar icon.
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            app.global_shortcut().register(show_hide)?;

            let label = format!("Show or hide __PET_NAME__ ({SHOW_HIDE_KEYS})");
            let toggle = MenuItem::with_id(app, "toggle", label, true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&toggle, &quit_item])?;
            TrayIconBuilder::with_id("pet")
                .icon(app.default_window_icon().cloned().expect("app icon is bundled"))
                .tooltip("__PET_NAME__")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "toggle" => toggle_pet(app),
                    "quit" => quit(app.clone()),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        toggle_pet(tray.app_handle());
                    }
                })
                .build(app)?;
            Ok(())
        })
        .manage(stats::Cache::default())
        .manage(Board::default())
        .manage(dictation::Dictation::default())
        .invoke_handler(tauri::generate_handler![
            read_sessions,
            save_position,
            quit,
            sleep_minutes,
            session_stats,
            toggle_board,
            hide_board,
            show_claude,
            open_in_code,
            quick_chat,
            dictation_ready,
            start_recording,
            stop_recording,
            left_button_down
        ])
        .run(tauri::generate_context!())
        .expect("__PET_NAME__ could not start");
}
