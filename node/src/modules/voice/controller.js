const OpenAI = require('openai');

let _openai = null;
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

// ISO code → full language name (for GPT translation prompt)
const LANG_NAMES = {
  en: 'English',    es: 'Spanish',     fr: 'French',      de: 'German',
  it: 'Italian',    pt: 'Portuguese',  nl: 'Dutch',       bg: 'Bulgarian',
  hr: 'Croatian',   el: 'Greek',       cs: 'Czech',       da: 'Danish',
  et: 'Estonian',    fi: 'Finnish',     hu: 'Hungarian',   is: 'Icelandic',
  lv: 'Latvian',    lt: 'Lithuanian',  no: 'Norwegian',   pl: 'Polish',
  ro: 'Romanian',   sr: 'Serbian',     sk: 'Slovak',      sl: 'Slovenian',
  sv: 'Swedish',    tr: 'Turkish',
};

// Whisper returns language as full English name lowercase (e.g. 'spanish', 'turkish')
// Map that back to ISO code for comparison
const WHISPER_TO_ISO = {
  english: 'en',    spanish: 'es',     french: 'fr',      german: 'de',
  italian: 'it',    portuguese: 'pt',  dutch: 'nl',       bulgarian: 'bg',
  croatian: 'hr',   greek: 'el',       czech: 'cs',       danish: 'da',
  estonian: 'et',   finnish: 'fi',     hungarian: 'hu',   icelandic: 'is',
  latvian: 'lv',    lithuanian: 'lt',  norwegian: 'no',   polish: 'pl',
  romanian: 'ro',   serbian: 'sr',     slovak: 'sk',      slovenian: 'sl',
  swedish: 'sv',    turkish: 'tr',
};

exports.transcribe = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, error: { code: 'NO_AUDIO', message: 'No audio file provided' } });
    }
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ ok: false, error: { code: 'NO_API_KEY', message: 'OpenAI API key not configured' } });
    }

    const writeLang = req.body.write_lang || 'es';

    // 1. Transcribe with Whisper (auto-detect spoken language)
    const file = new File([req.file.buffer], 'audio.webm', { type: req.file.mimetype || 'audio/webm' });

    const transcription = await getOpenAI().audio.transcriptions.create({
      file,
      model: 'whisper-1',
      response_format: 'verbose_json',
    });

    let text = transcription.text.trim();
    const detectedLang = transcription.language; // e.g. 'spanish', 'english'

    // 2. Compare detected language with target
    const detectedISO = WHISPER_TO_ISO[detectedLang?.toLowerCase()] || null;
    const needsTranslation = text.length > 0 && detectedISO !== writeLang;

    // 3. Always translate to target language (even if detection failed, to be safe)
    if (needsTranslation && text.length > 0) {
      const targetName = LANG_NAMES[writeLang] || 'English';
      const chat = await getOpenAI().chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a translator. Translate the following text to ${targetName}. Output ONLY the translated text, nothing else. Preserve the tone, meaning and style exactly. Do not add explanations.`
          },
          { role: 'user', content: text }
        ],
        temperature: 0.3,
        max_tokens: 2000,
      });
      text = chat.choices[0].message.content.trim();
    }

    console.log(`[Voice] Detected: ${detectedLang} (${detectedISO}), Target: ${writeLang}, Translated: ${needsTranslation}`);
    res.json({ ok: true, text, detected: detectedLang, translated: !!needsTranslation });
  } catch (err) {
    require('../../utils/httpError').sendError(res, 500, { code: 'TRANSCRIBE_FAIL', message: err.message }, err);
  }
};
