//! The board's mic button. Recording opens the default microphone; stopping turns the clip
//! into text on this computer with whisper.cpp: its `whisper-cli` program (see `whisper_cli`)
//! and the English `base.en` model in __PET_NAME__'s app data folder under `whisper/`. Nothing is
//! sent anywhere.

use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::mpsc::{channel, Receiver, Sender};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::Duration;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{FromSample, SampleFormat, SizedSample};

/// A recording stops by itself after this long, in case the board was closed mid-sentence.
const MAX_SECONDS: u64 = 60;
/// whisper.cpp reads 16 kHz mono audio.
const WHISPER_RATE: u32 = 16_000;

type Clip = (Vec<f32>, u32); // mono samples and their sample rate

/// A recording in progress: the thread that owns the microphone, and the way to stop it.
/// The microphone stream lives on its own thread because it cannot be shared between threads.
struct Recording {
    stop: Sender<()>,
    thread: JoinHandle<Result<Clip, String>>,
}

#[derive(Default)]
pub struct Dictation(Mutex<Option<Recording>>);

impl Dictation {
    /// Opens the microphone and starts keeping what it hears. Returns once it is listening.
    pub fn start(&self) -> Result<(), String> {
        let mut slot = self.0.lock().map_err(|_| "The recorder is busy")?;
        if slot.is_some() {
            return Err("Already recording".into());
        }
        let (stop, stopped) = channel();
        let (opened, opened_rx) = channel();
        let thread = std::thread::spawn(move || record(stopped, opened));
        opened_rx
            .recv_timeout(Duration::from_secs(5))
            .map_err(|_| "The microphone did not start".to_string())??;
        *slot = Some(Recording { stop, thread });
        Ok(())
    }

    /// Closes the microphone and returns what was recorded.
    pub fn stop(&self) -> Result<Clip, String> {
        let recording = self.0.lock().map_err(|_| "The recorder is busy")?.take().ok_or("Not recording")?;
        let _ = recording.stop.send(());
        recording.thread.join().map_err(|_| "The recorder stopped unexpectedly".to_string())?
    }
}

fn record(stopped: Receiver<()>, opened: Sender<Result<(), String>>) -> Result<Clip, String> {
    let samples = Arc::new(Mutex::new(Vec::new()));
    let started = open_microphone(samples.clone());
    let (stream, rate) = match started {
        Ok(ok) => ok,
        Err(error) => {
            let _ = opened.send(Err(error.clone()));
            return Err(error);
        }
    };
    let _ = opened.send(Ok(()));
    let _ = stopped.recv_timeout(Duration::from_secs(MAX_SECONDS));
    drop(stream);
    let clip = std::mem::take(&mut *samples.lock().map_err(|_| "The recording was lost")?);
    Ok((clip, rate))
}

fn open_microphone(sink: Arc<Mutex<Vec<f32>>>) -> Result<(cpal::Stream, u32), String> {
    let device = cpal::default_host().default_input_device().ok_or("No microphone found")?;
    let config = device.default_input_config().map_err(|e| format!("The microphone is not available: {e}"))?;
    let rate = config.sample_rate();
    let stream = match config.sample_format() {
        SampleFormat::F32 => listen::<f32>(&device, config.into(), sink),
        SampleFormat::I16 => listen::<i16>(&device, config.into(), sink),
        SampleFormat::U16 => listen::<u16>(&device, config.into(), sink),
        other => return Err(format!("Unsupported microphone format: {other}")),
    }?;
    stream.play().map_err(|e| format!("The microphone did not start: {e}"))?;
    Ok((stream, rate))
}

/// Builds the input stream: each block of frames is averaged to mono and kept as f32.
fn listen<T>(device: &cpal::Device, config: cpal::StreamConfig, sink: Arc<Mutex<Vec<f32>>>) -> Result<cpal::Stream, String>
where
    T: SizedSample,
    f32: FromSample<T>,
{
    let channels = config.channels as usize;
    device
        .build_input_stream(
            config,
            move |data: &[T], _| {
                if let Ok(mut kept) = sink.lock() {
                    kept.extend(data.chunks(channels).map(|frame| {
                        frame.iter().map(|s| s.to_sample::<f32>()).sum::<f32>() / channels as f32
                    }));
                }
            },
            |_| {}, // a dropped buffer only loses a moment of audio
            None,
        )
        .map_err(|e| format!("The microphone did not open: {e}"))
}

/// Where whisper.cpp and its model live, and whether both are there.
pub fn whisper_dir(local_data: &Path) -> PathBuf {
    local_data.join("whisper")
}

pub fn ready(dir: &Path) -> bool {
    whisper_cli(dir).is_some() && dir.join("ggml-base.en.bin").is_file()
}

/// whisper.cpp's command-line program: a copy in the `bin` folder next to the model (how it is
/// installed on Windows), or on a Mac the one Homebrew installs with `brew install whisper-cpp`
/// (in /opt/homebrew/bin on Apple silicon, /usr/local/bin on Intel).
fn whisper_cli(dir: &Path) -> Option<PathBuf> {
    let name = if cfg!(windows) { "whisper-cli.exe" } else { "whisper-cli" };
    let mut places = vec![dir.join("bin").join(name)];
    if cfg!(target_os = "macos") {
        places.push(PathBuf::from("/opt/homebrew/bin/whisper-cli"));
        places.push(PathBuf::from("/usr/local/bin/whisper-cli"));
    }
    places.into_iter().find(|p| p.is_file())
}

/// Turns a clip into text with whisper.cpp. The clip is written as a WAV file next to the
/// model, read by `whisper-cli`, and deleted again (kept if PET_KEEP_CLIP is set).
pub fn transcribe(dir: &Path, (samples, rate): Clip) -> Result<String, String> {
    if samples.len() < rate as usize / 3 {
        return Ok(String::new()); // under a third of a second: nothing was said
    }
    // A live microphone always carries some room noise. Near-zero level means the mic is off
    // or muted, and whisper would invent a word ("you") from the silence, so say so instead.
    if loudness(&samples) < SILENCE_RMS {
        return Err("Nothing came through the microphone. Is it on and unmuted?".into());
    }
    let cli = whisper_cli(dir).ok_or("whisper.cpp is not installed")?;
    let wav = dir.join("clip.wav");
    write_wav(&wav, &resample(&samples, rate, WHISPER_RATE)).map_err(|e| format!("Could not save the clip: {e}"))?;

    let threads = std::thread::available_parallelism().map_or(4, |n| n.get().min(8)).to_string();
    let output = crate::hidden(Command::new(cli))
        .arg("-m")
        .arg(dir.join("ggml-base.en.bin"))
        .arg("-f")
        .arg(&wav)
        .args(["-l", "en", "-nt", "-np", "-t", &threads])
        .output()
        .map_err(|e| format!("Could not run whisper: {e}"))?;
    if std::env::var_os("PET_KEEP_CLIP").is_none() {
        let _ = std::fs::remove_file(&wav);
    }
    if !output.status.success() {
        return Err("whisper could not read the clip".into());
    }
    Ok(clean(&String::from_utf8_lossy(&output.stdout)))
}

/// Root-mean-square level of the clip (0 is silence, 1 is full scale). Speech into a headset
/// is around 0.02 to 0.2; a quiet room on a live mic is around 0.0005 to 0.002.
const SILENCE_RMS: f32 = 0.0002;

fn loudness(samples: &[f32]) -> f32 {
    (samples.iter().map(|s| s * s).sum::<f32>() / samples.len().max(1) as f32).sqrt()
}

/// Joins whisper's lines and drops its non-speech tags such as "[BLANK_AUDIO]" or "(wind)".
fn clean(text: &str) -> String {
    text.lines()
        .map(str::trim)
        .filter(|l| !l.is_empty() && !(l.starts_with('[') && l.ends_with(']')) && !(l.starts_with('(') && l.ends_with(')')))
        .collect::<Vec<_>>()
        .join(" ")
}

/// Linear resampling: plenty for speech going into a speech model.
fn resample(samples: &[f32], from: u32, to: u32) -> Vec<f32> {
    if from == to {
        return samples.to_vec();
    }
    let step = from as f64 / to as f64;
    let len = (samples.len() as f64 / step) as usize;
    (0..len)
        .map(|i| {
            let pos = i as f64 * step;
            let (j, frac) = (pos as usize, (pos.fract()) as f32);
            let a = samples[j];
            let b = *samples.get(j + 1).unwrap_or(&a);
            a + (b - a) * frac
        })
        .collect()
}

fn write_wav(path: &Path, samples: &[f32]) -> Result<(), hound::Error> {
    let spec = hound::WavSpec { channels: 1, sample_rate: WHISPER_RATE, bits_per_sample: 16, sample_format: hound::SampleFormat::Int };
    let mut writer = hound::WavWriter::create(path, spec)?;
    for s in samples {
        writer.write_sample((s.clamp(-1.0, 1.0) * i16::MAX as f32) as i16)?;
    }
    writer.finalize()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_silent_mic_is_reported_not_transcribed() {
        let dir = std::env::temp_dir();
        let silent = (vec![0.0; 48_000], 48_000);
        assert!(transcribe(&dir, silent).unwrap_err().contains("Is it on"));
        assert!(loudness(&[0.1, -0.1]) > SILENCE_RMS);
    }

    #[test]
    fn drops_non_speech_tags() {
        assert_eq!(clean(" [BLANK_AUDIO]\n Fix the putt.\n(wind blowing)\n"), "Fix the putt.");
    }

    /// Lists this PC's recording devices and which one is the default, for when the mic
    /// records silence. Run by hand: `cargo test list_microphones -- --ignored --nocapture`.
    #[test]
    #[ignore = "reads this PC's audio devices"]
    fn list_microphones() {
        let host = cpal::default_host();
        let default = host.default_input_device().and_then(|d| d.description().ok()).map(|d| d.to_string());
        println!("default: {default:?}");
        for device in host.input_devices().expect("input devices") {
            let config = device.default_input_config().map(|c| format!("{c:?}")).unwrap_or_else(|e| e.to_string());
            println!("- {:?}: {config}", device.description().map(|d| d.to_string()));
        }
    }

    #[test]
    fn resamples_to_the_right_length() {
        assert_eq!(resample(&vec![0.0; 48_000], 48_000, 16_000).len(), 16_000);
        assert_eq!(resample(&[0.5, 0.5], 16_000, 16_000), vec![0.5, 0.5]);
    }
}
