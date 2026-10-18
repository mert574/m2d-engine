// Original example audio synthesized from sine waves. MIT License; see LICENSE.
// Frequencies and note lengths are generated here rather than sampled from recordings.
export function synthesizeAudio(notes, noteSeconds = 0.12) {
  const sampleRate = 12000;
  const samplesPerNote = Math.round(sampleRate * noteSeconds);
  const dataSize = samplesPerNote * notes.length * 2;
  const bytes = new Uint8Array(44 + dataSize);
  const view = new DataView(bytes.buffer);
  const text = (offset, value) => {
    for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i);
  };
  text(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, dataSize, true);
  notes.forEach((frequency, note) => {
    for (let i = 0; i < samplesPerNote; i++) {
      const progress = i / samplesPerNote;
      const envelope = Math.min(1, progress * 30) * (1 - progress) ** 2;
      const sample = Math.sin(2 * Math.PI * frequency * i / sampleRate);
      view.setInt16(44 + (note * samplesPerNote + i) * 2,
        Math.round(sample * envelope * 7000), true);
    }
  });
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:audio/wav;base64,${btoa(binary)}`;
}

export const jumpSound = synthesizeAudio([220, 440, 660], 0.045);
export const coinSound = synthesizeAudio([660, 880], 0.07);
export const gameOverSound = synthesizeAudio([330, 220, 110], 0.18);
export const levelCompleteSound = synthesizeAudio([330, 440, 550, 660], 0.12);
export const attackSound = synthesizeAudio([180, 90], 0.04);
export const damageSound = synthesizeAudio([140, 100], 0.09);
export const menuMusic = synthesizeAudio([220, 0, 330, 0, 275, 0, 330, 0], 0.25);
export const gameMusic = synthesizeAudio([220, 330, 440, 330, 275, 330, 550, 330], 0.25);
