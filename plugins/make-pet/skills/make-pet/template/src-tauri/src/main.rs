// No console window behind __PET_NAME__ in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    __PET_LIB__::run()
}
