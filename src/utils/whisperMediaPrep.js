/**
 * Video > 25MB: tach track am thanh + nen (ffmpeg.wasm) de gui OpenAI Whisper.
 * Import dong de khong tang bundle ban dau.
 */

export const MAX_WHISPER_BYTES = 25 * 1024 * 1024;

const CORE_VERSION = '0.12.10';

let ffmpegLoadPromise = null;
let ffmpegInstance = null;
let runChain = Promise.resolve();

async function getFFmpeg() {
  if (ffmpegInstance?.loaded) return ffmpegInstance;
  if (!ffmpegLoadPromise) {
    ffmpegLoadPromise = (async () => {
      const { FFmpeg } = await import('@ffmpeg/ffmpeg');
      const { toBlobURL } = await import('@ffmpeg/util');
      const ffmpeg = new FFmpeg();
      const base = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/esm`;
      await ffmpeg.load({
        coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm')
      });
      ffmpegInstance = ffmpeg;
      return ffmpeg;
    })();
  }
  return ffmpegLoadPromise;
}

function guessInputExt(file) {
  const n = (file.name || '').toLowerCase();
  const t = (file.type || '').toLowerCase();
  if (t.includes('webm') || n.endsWith('.webm')) return '.webm';
  if (t.includes('mp4') || n.endsWith('.mp4') || n.endsWith('.m4v')) return '.mp4';
  if (t.includes('quicktime') || n.endsWith('.mov')) return '.mov';
  if (t.includes('mpeg') || n.endsWith('.mpeg')) return '.mpeg';
  if (t.includes('wav') || n.endsWith('.wav')) return '.wav';
  if (t.includes('mp3') || n.endsWith('.mp3')) return '.mp3';
  if (t.includes('ogg') || n.endsWith('.ogg')) return '.ogg';
  return '.mp4';
}

async function safeDelete(ffmpeg, path) {
  try {
    await ffmpeg.deleteFile(path);
  } catch {
    // ignore
  }
}

/**
 * @param {File} file
 * @param {number} maxBytes
 * @returns {Promise<File>}
 */
export async function ensureWhisperSizedMedia(file, maxBytes = MAX_WHISPER_BYTES) {
  if (!file || file.size <= maxBytes) return file;

  const work = async () => {
    const { fetchFile } = await import('@ffmpeg/util');
    const ffmpeg = await getFFmpeg();
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const inputName = `in_${id}${guessInputExt(file)}`;

    await ffmpeg.writeFile(inputName, await fetchFile(file));

    try {
      const tryAudioCopy = async () => {
        const out = `copy_${id}.m4a`;
        try {
          await ffmpeg.exec(['-i', inputName, '-vn', '-map', '0:a:0', '-c:a', 'copy', out]);
          const data = await ffmpeg.readFile(out, 'binary');
          await safeDelete(ffmpeg, out);
          const f = new File(
            [new Blob([data], { type: 'audio/mp4' })],
            'audio-extract.m4a',
            { type: 'audio/mp4' }
          );
          return f.size <= maxBytes ? f : null;
        } catch {
          await safeDelete(ffmpeg, out);
          return null;
        }
      };

      const tryOpus = async (bitrate) => {
        const out = `opus_${id}_${bitrate}.webm`;
        try {
          await ffmpeg.exec([
            '-i',
            inputName,
            '-vn',
            '-ac',
            '1',
            '-ar',
            '16000',
            '-c:a',
            'libopus',
            '-b:a',
            bitrate,
            out
          ]);
          const data = await ffmpeg.readFile(out, 'binary');
          await safeDelete(ffmpeg, out);
          return new File([new Blob([data], { type: 'audio/webm' })], 'speech.webm', {
            type: 'audio/webm'
          });
        } catch {
          await safeDelete(ffmpeg, out);
          return null;
        }
      };

      const tryMp3 = async (bitrate) => {
        const out = `mp3_${id}_${bitrate}.mp3`;
        try {
          await ffmpeg.exec([
            '-i',
            inputName,
            '-vn',
            '-ac',
            '1',
            '-ar',
            '16000',
            '-c:a',
            'libmp3lame',
            '-b:a',
            bitrate,
            out
          ]);
          const data = await ffmpeg.readFile(out, 'binary');
          await safeDelete(ffmpeg, out);
          return new File([new Blob([data], { type: 'audio/mpeg' })], 'speech.mp3', {
            type: 'audio/mpeg'
          });
        } catch {
          await safeDelete(ffmpeg, out);
          return null;
        }
      };

      const demuxed = await tryAudioCopy();
      if (demuxed) return demuxed;

      for (const br of ['48k', '40k', '32k', '24k', '16k', '12k']) {
        const f = await tryOpus(br);
        if (f && f.size <= maxBytes) return f;
      }

      for (const br of ['48k', '32k', '24k']) {
        const f = await tryMp3(br);
        if (f && f.size <= maxBytes) return f;
      }

      throw new Error('COMPRESS_FAIL');
    } finally {
      await safeDelete(ffmpeg, inputName);
    }
  };

  const done = runChain.then(work, work);
  runChain = done.catch(() => {});

  try {
    return await done;
  } catch (e) {
    const raw = e?.message || String(e);
    if (raw.includes('COMPRESS_FAIL')) {
      throw new Error(
        'Khong the nen audio xuong duoi 25MB (ban ghi qua dai). Hay cat ngan hoac chia nho file.'
      );
    }
    throw new Error(
      `Khong tach/nen audio tu video: ${raw}. Can mang de tai ffmpeg (lan dau). Thu mp4/webm hoac file nho hon.`
    );
  }
}
