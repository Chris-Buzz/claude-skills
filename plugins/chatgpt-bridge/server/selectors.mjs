// Every ChatGPT page selector lives here, so a site change is a one-file fix.
// If something stops working, run the chatgpt_debug tool: it prints a short outline of
// the composer and the latest turn, which is enough to repair these.

// 2026-10-25: ChatGPT moved to one `[data-turn-key]` block per exchange (your message and the reply
// together), dropped the test ids on Send and Stop and the id on the composer. The old selectors
// stay as fallbacks after each comma.
export const SEL = {
  composer: 'div.ProseMirror[contenteditable="true"], #prompt-textarea',
  sendButton: 'button[aria-label="Send"], [data-testid="send-button"]',
  stopButton: 'button[aria-label="Stop"], [data-testid="stop-button"]',
  loginButton: '[data-testid="login-button"], a[href*="/auth/login"], a[href*="/log-in"]',
  turn: '[data-turn-key], article[data-testid^="conversation-turn"]',
  // "in_progress" while ChatGPT is answering, "complete" when done; absent on the old markup.
  turnState: '[data-talvt-turn-state]',
  userMessage: '[data-user-message-bubble="true"], [data-message-author-role="user"]',
  // Screen-reader labels inside a turn, dropped from the reply text.
  srLabels: ['You said:', 'ChatGPT said:', 'Edit', 'Show more'],
  // Generated pictures render as large <img> elements inside the turn. Variant thumbnails and
  // hidden copies have the same natural size, so only images shown at least minShownPx wide count.
  minImagePx: 256,
  minShownPx: 120,
};

export const HOME = 'https://chatgpt.com/';
export const TEMP_HOME = 'https://chatgpt.com/?temporary-chat=true';
