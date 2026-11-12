//! Reads a Claude Code transcript (one JSON record per line) into the numbers __PET_NAME__'s board
//! shows. A result is cached against the file's size and modified time, so a transcript is
//! parsed again only after Claude writes to it.

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::SystemTime;

use serde::Serialize;
use serde_json::Value;

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct Stats {
    /// The session's title as the Claude app shows it, else its agent name.
    pub title: Option<String>,
    pub model: Option<String>,
    pub branch: Option<String>,
    pub first_at: Option<String>,
    pub last_at: Option<String>,
    /// Prompts the user (or the session that started this one) sent.
    pub turns: u32,
    pub tool_calls: u32,
    pub output_tokens: u64,
    /// Input plus cache tokens of the latest reply: how much context the session carries now.
    pub context_tokens: u64,
    pub turns_today: u32,
    pub output_today: u64,
    pub last_prompt: Option<String>,
    pub last_reply: Option<String>,
}

#[derive(Default)]
pub struct Cache(Mutex<HashMap<PathBuf, (u64, SystemTime, String, Stats)>>);

impl Cache {
    /// Stats for a transcript; `since` is an ISO time, and turns and tokens after it count as today.
    pub fn get(&self, path: &Path, since: &str) -> Option<Stats> {
        let meta = fs::metadata(path).ok()?;
        let stamp = (meta.len(), meta.modified().ok()?);
        let mut cache = self.0.lock().ok()?;
        if let Some((len, modified, cached_since, stats)) = cache.get(path) {
            if (*len, *modified) == stamp && cached_since == since {
                return Some(stats.clone());
            }
        }
        let stats = read(&fs::read_to_string(path).ok()?, since);
        cache.insert(path.to_path_buf(), (stamp.0, stamp.1, since.to_owned(), stats.clone()));
        Some(stats)
    }
}

/// One reply's usage. Claude Code writes each content block of a reply as its own record
/// carrying the same message id, so usage is kept per id rather than summed per record.
struct Reply {
    output: u64,
    today: bool,
}

pub fn read(text: &str, since: &str) -> Stats {
    let mut s = Stats::default();
    let mut agent_name = None;
    let mut replies: HashMap<String, Reply> = HashMap::new();

    for line in text.lines() {
        let Ok(v) = serde_json::from_str::<Value>(line) else { continue };
        let kind = v["type"].as_str().unwrap_or_default();
        match kind {
            "custom-title" => s.title = v["customTitle"].as_str().map(str::to_owned),
            "agent-name" => agent_name = v["agentName"].as_str().map(str::to_owned),
            _ => {}
        }
        // Subagents write into the same file; only the session's own conversation counts.
        if !(kind == "user" || kind == "assistant") || v["isSidechain"].as_bool() == Some(true) {
            continue;
        }

        let at = v["timestamp"].as_str();
        if let Some(at) = at {
            s.first_at.get_or_insert_with(|| at.to_owned());
            s.last_at = Some(at.to_owned());
        }
        if let Some(branch) = v["gitBranch"].as_str().filter(|b| !b.is_empty()) {
            s.branch = Some(branch.to_owned());
        }
        let today = at.is_some_and(|t| t >= since);
        let message = &v["message"];

        if kind == "user" {
            // Meta records and the summary written after compacting are not prompts.
            if v["isMeta"].as_bool() == Some(true) || v["isCompactSummary"].as_bool() == Some(true) {
                continue;
            }
            if let Some(prompt) = prompt_text(message) {
                s.turns += 1;
                if today {
                    s.turns_today += 1;
                }
                s.last_prompt = Some(clip(&prompt));
            }
            continue;
        }

        if let Some(model) = message["model"].as_str().filter(|m| !m.starts_with('<')) {
            s.model = Some(model.to_owned());
        }
        for block in message["content"].as_array().into_iter().flatten() {
            match block["type"].as_str() {
                Some("tool_use") => s.tool_calls += 1,
                Some("text") => {
                    if let Some(t) = block["text"].as_str().filter(|t| !t.trim().is_empty()) {
                        s.last_reply = Some(clip(t));
                    }
                }
                _ => {}
            }
        }
        let usage = &message["usage"];
        if let (Some(id), true) = (message["id"].as_str(), usage.is_object()) {
            let output = usage["output_tokens"].as_u64().unwrap_or(0);
            let reply = replies.entry(id.to_owned()).or_insert(Reply { output: 0, today });
            reply.output = reply.output.max(output);
            s.context_tokens = ["input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens"]
                .iter()
                .map(|k| usage[*k].as_u64().unwrap_or(0))
                .sum();
        }
    }

    s.output_tokens = replies.values().map(|r| r.output).sum();
    s.output_today = replies.values().filter(|r| r.today).map(|r| r.output).sum();
    if s.title.is_none() {
        s.title = agent_name;
    }
    s
}

/// The text of a prompt with the app's injected <system-reminder> blocks removed, or None
/// for records that carry tool results back to Claude or hold nothing but reminders.
fn prompt_text(message: &Value) -> Option<String> {
    let raw = match &message["content"] {
        Value::String(text) => text.clone(),
        Value::Array(blocks) => {
            if blocks.iter().any(|b| b["type"] == "tool_result") {
                return None;
            }
            blocks.iter().filter_map(|b| b["text"].as_str()).collect::<Vec<_>>().join("\n")
        }
        _ => return None,
    };
    let text = strip_reminders(&raw);
    let text = text.trim();
    (!text.is_empty()).then(|| text.to_owned())
}

fn strip_reminders(text: &str) -> String {
    const OPEN: &str = "<system-reminder>";
    const CLOSE: &str = "</system-reminder>";
    let mut out = String::new();
    let mut rest = text;
    while let Some(start) = rest.find(OPEN) {
        out.push_str(&rest[..start]);
        match rest[start..].find(CLOSE) {
            Some(end) => rest = &rest[start + end + CLOSE.len()..],
            None => return out,
        }
    }
    out.push_str(rest);
    out
}

/// First 180 characters, whitespace collapsed, for a one-glance preview.
fn clip(text: &str) -> String {
    let flat = text.split_whitespace().collect::<Vec<_>>().join(" ");
    match flat.char_indices().nth(180) {
        Some((cut, _)) => format!("{}...", &flat[..cut]),
        None => flat,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counts_turns_tools_and_tokens_once_per_reply() {
        let text = [
            r#"{"type":"custom-title","customTitle":"Golf swing"}"#,
            r#"{"type":"user","timestamp":"2026-11-06T10:00:00Z","message":{"content":"fix the swing"}}"#,
            r#"{"type":"assistant","timestamp":"2026-11-06T10:00:05Z","gitBranch":"golf","message":{"id":"m1","model":"claude-sonnet-5-5","content":[{"type":"text","text":"Looking."}],"usage":{"output_tokens":40,"input_tokens":3,"cache_read_input_tokens":1000}}}"#,
            r#"{"type":"assistant","timestamp":"2026-11-06T10:00:06Z","message":{"id":"m1","content":[{"type":"tool_use"}],"usage":{"output_tokens":40,"input_tokens":3,"cache_read_input_tokens":1000}}}"#,
            r#"{"type":"user","timestamp":"2026-11-06T10:00:07Z","message":{"content":[{"type":"tool_result"}]}}"#,
            r#"{"type":"assistant","timestamp":"2026-11-07T09:00:00Z","isSidechain":true,"message":{"id":"sub","usage":{"output_tokens":999}}}"#,
            r#"{"type":"user","timestamp":"2026-11-07T08:00:00Z","isCompactSummary":true,"message":{"content":"This session is being continued"}}"#,
            r#"{"type":"user","timestamp":"2026-11-07T08:30:00Z","message":{"content":"<system-reminder>only a note</system-reminder>"}}"#,
            r#"{"type":"user","timestamp":"2026-11-07T09:00:00Z","message":{"content":[{"type":"text","text":"<system-reminder>\nLinked sessions now</system-reminder>"},{"type":"text","text":"now  the putt"}]}}"#,
            r#"{"type":"assistant","timestamp":"2026-11-07T09:00:09Z","message":{"id":"m2","model":"claude-sonnet-5-5","content":[{"type":"text","text":"Done."}],"usage":{"output_tokens":60,"input_tokens":5,"cache_creation_input_tokens":200,"cache_read_input_tokens":1500}}}"#,
        ]
        .join("\n");
        let s = read(&text, "2026-11-07T05:00:00.000Z");
        assert_eq!(s.title.as_deref(), Some("Golf swing"));
        assert_eq!(s.turns, 2);
        assert_eq!(s.turns_today, 1);
        assert_eq!(s.tool_calls, 1);
        assert_eq!(s.output_tokens, 100);
        assert_eq!(s.output_today, 60);
        assert_eq!(s.context_tokens, 1705);
        assert_eq!(s.branch.as_deref(), Some("golf"));
        assert_eq!(s.last_prompt.as_deref(), Some("now the putt"));
        assert_eq!(s.last_reply.as_deref(), Some("Done."));
    }
}
