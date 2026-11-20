import { M2D } from 'm2d-engine';
import { initPhysics } from 'm2d-engine/physics';

/** Builds a short WAV from a list of sine-wave notes and returns it as a data URL. */
function synthesize(notes, noteSeconds = 0.12) {
  const sampleRate = 12000;
  const perNote = Math.round(sampleRate * noteSeconds);
  const dataSize = perNote * notes.length * 2;
  const bytes = new Uint8Array(44 + dataSize);
  const view = new DataView(bytes.buffer);
  const text = (offset, value) => { for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i); };
  text(0, 'RIFF'); view.setUint32(4, 36 + dataSize, true); text(8, 'WAVE');
  text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, dataSize, true);
  notes.forEach((frequency, note) => {
    for (let i = 0; i < perNote; i++) {
      const progress = i / perNote;
      const envelope = Math.min(1, progress * 30) * (1 - progress) ** 2;
      const sample = Math.sin(2 * Math.PI * frequency * i / sampleRate) * envelope * 7000;
      view.setInt16(44 + (note * perNote + i) * 2, Math.round(sample), true);
    }
  });
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:audio/wav;base64,${btoa(binary)}`;
}

const EFFECTS = ['jump', 'coin', 'damage'];
const BUTTON = { variant: 'secondary', fontSize: '16px' };

// A UI scene: every control is an element with an action, which the
// scene's onAction hook receives and answers through the sound manager.
const scene = {
  version: 7, type: 'ui', name: 'main',
  elements: [
    { type: 'rect', id: 'background', fill: true, color: '#1b2a38' },
    { type: 'text', id: 'title', anchor: 'top', x: 0, y: 16,
      properties: { text: 'Sound', fontSize: '28px', align: 'center', color: '#ffffff' } },
    { type: 'text', id: 'status', anchor: 'center', x: 0, y: -60,
      properties: { text: 'click a pad', fontSize: '16px', align: 'center', color: '#9fb6d0' } },
    ...EFFECTS.map((name, i) => ({
      type: 'button', id: name, anchor: 'center', x: -160 + i * 160, y: 0,
      properties: { text: name, action: name, width: 130, height: 48, ...BUTTON }
    })),
    { type: 'button', id: 'music', anchor: 'center', x: -90, y: 70,
      properties: { text: 'play music', action: 'music', width: 160, height: 40, ...BUTTON } },
    { type: 'text', id: 'volume', anchor: 'center', x: 90, y: 62,
      properties: { text: '', fontSize: '14px', align: 'center', color: '#9fb6d0' } },
    { type: 'button', id: 'quieter', anchor: 'center', x: 40, y: 90,
      properties: { text: '-', action: 'quieter', width: 44, height: 32, ...BUTTON } },
    { type: 'button', id: 'louder', anchor: 'center', x: 140, y: 90,
      properties: { text: '+', action: 'louder', width: 44, height: 32, ...BUTTON } },
    { type: 'button', id: 'mute', anchor: 'bottom', x: 0, y: -32,
      properties: { text: 'mute', action: 'mute', width: 120, height: 36, ...BUTTON } }
  ]
};

export default async function start(canvas) {
  await initPhysics();
  const game = new M2D(canvas, {
    width: 640, height: 360, initialScene: 'main', performanceStats: false,
    // Each key becomes a name to play by. The values are URLs.
    sounds: {
      jump: synthesize([220, 440, 660], 0.045),
      coin: synthesize([660, 880], 0.07),
      damage: synthesize([140, 100], 0.09)
    },
    music: {
      theme: synthesize([262, 330, 392, 523, 392, 330, 262, 196], 0.2)
    }
  });

  const sound = game.soundManager;
  const element = (id) => game.sceneManager.getCurrentScene().uiById.get(id);
  let playing = false;
  let volume = 0.5;
  const setVolume = (value) => {
    volume = Math.min(1, Math.max(0, value));
    sound.setMusicVolume(volume);
    element('volume').text = `music volume ${volume.toFixed(1)}`;
  };
  const stopMusic = () => {
    playing = false;
    element('music').text = 'play music';
  };

  game.sceneManager.addScene('main', {
    fetch: async () => scene,
    onEnter() {
      setVolume(volume);
    },
    onAction(name) {
      const status = element('status');
      if (EFFECTS.includes(name)) {
        // One-shot effects. Overlapping plays are allowed.
        sound.playSound(name);
        status.text = `playSound('${name}')`;
      } else if (name === 'music') {
        // Looping music, started and stopped.
        if (playing) { sound.stopMusic(); stopMusic(); } else { sound.playMusic('theme'); playing = true; element('music').text = 'stop music'; }
        status.text = playing ? "playMusic('theme')" : 'stopMusic()';
      } else if (name === 'quieter') {
        setVolume(volume - 0.1);
      } else if (name === 'louder') {
        setVolume(volume + 0.1);
      } else if (name === 'mute') {
        sound.toggleMute();
        status.text = sound.isMuted ? 'muted. music stopped' : 'unmuted';
        if (sound.isMuted) stopMusic();
      }
    }
  });

  await game.start();
  return game;
}
