const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

export const audioUploadName = (mimetype?: string) => {
  if (mimetype?.includes("mpeg") || mimetype?.includes("mp3")) return "audio.mp3";
  if (mimetype?.includes("mp4") || mimetype?.includes("m4a")) return "audio.m4a";
  if (mimetype?.includes("wav")) return "audio.wav";
  if (mimetype?.includes("webm")) return "audio.webm";
  return "audio.ogg";
};

export const transcribeSecretaryAudio = async (
  buffer: Buffer,
  mimetype?: string
): Promise<{ text?: string; error?: string }> => {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return { error: "Transcricao sem chave da OpenAI." };
  if (!buffer.length) return { error: "Audio vazio." };
  if (buffer.length > MAX_AUDIO_BYTES) return { error: "Audio grande demais." };

  const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.OPENAI_TRANSCRIBE_MODEL || "whisper-1";
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(buffer)], { type: mimetype || "audio/ogg" }),
    audioUploadName(mimetype)
  );
  form.append("model", model);
  form.append("language", "pt");

  const response = await fetch(`${baseUrl}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form
  });

  const payload = (await response.json().catch(() => ({}))) as { text?: string; error?: { message?: string } };
  const text = payload.text?.trim();
  if (!response.ok || !text) {
    return { error: payload.error?.message || "Nao consegui transcrever o audio." };
  }
  return { text };
};
