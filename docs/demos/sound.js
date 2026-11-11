import { M2D } from 'm2d-engine/core/m2d.js';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { UIButton } from 'm2d-engine/core/ui/button.js';
import { UIText } from 'm2d-engine/core/ui/text.js';

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

const scene = {
  version: 3, type: 'ui', name: 'main',
  elements: [
    { type: 'rect', id: 'background', fill: true, color: '#1b2a38' },
    { type: 'text', id: 'title', anchor: 'top', x: 0, y: 16,
      properties: { text: 'Sound', fontSize: '28px', align: 'center', color: '#ffffff' } }
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

  game.sceneManager.addScene('main', {
    fetch: async () => scene,
    onEnter() {
      const ui = game.sceneManager.getCurrentScene().ui;
      const sound = game.soundManager;
      const style = { variant: 'secondary', fontSize: '16px' };
      const status = ui.add(new UIText({
        x: 0,
        y: -60,
        text: 'click a pad',
        anchor: 'center',
        align: 'center',
        fontSize: '16px',
        color: '#9fb6d0'
      }));

      // One-shot effects. Overlapping plays are allowed.
      ['jump', 'coin', 'damage'].forEach((name, i) => {
        ui.add(new UIButton({
          x: -160 + i * 160,
          y: 0,
          width: 130,
          height: 48,
          text: name,
          onClick: () => {
            sound.playSound(name);
            status.text = `playSound('${name}')`;
          },
          ...style,
          anchor: 'center'
        }));
      });

      // Looping music, started and stopped.
      let playing = false;
      const music = ui.add(new UIButton({
        x: -90,
        y: 70,
        width: 160,
        height: 40,
        text: 'play music',
        onClick: () => {
          playing = !playing;
          if (playing) sound.playMusic('theme'); else sound.stopMusic();
          music.text = playing ? 'stop music' : 'play music';
          status.text = playing ? "playMusic('theme')" : 'stopMusic()';
        },
        ...style,
        anchor: 'center'
      }));

      let volume = 0.5;
      const volumeLabel = ui.add(new UIText({
        x: 90,
        y: 62,
        text: '',
        anchor: 'center',
        align: 'center',
        fontSize: '14px',
        color: '#9fb6d0'
      }));
      const setVolume = (value) => {
        volume = Math.min(1, Math.max(0, value));
        sound.setMusicVolume(volume);
        volumeLabel.text = `music volume ${volume.toFixed(1)}`;
      };
      ui.add(new UIButton({
        x: 40,
        y: 90,
        width: 44,
        height: 32,
        text: '-',
        onClick: () => setVolume(volume - 0.1),
        ...style,
        anchor: 'center'
      }));
      ui.add(new UIButton({
        x: 140,
        y: 90,
        width: 44,
        height: 32,
        text: '+',
        onClick: () => setVolume(volume + 0.1),
        ...style,
        anchor: 'center'
      }));
      setVolume(volume);

      ui.add(new UIButton({
        x: 0,
        y: -32,
        width: 120,
        height: 36,
        text: 'mute',
        onClick: () => {
          sound.toggleMute();
          status.text = sound.isMuted ? 'muted. music stopped' : 'unmuted';
          if (sound.isMuted) { playing = false; music.text = 'play music'; }
        },
        ...style,
        anchor: 'bottom'
      }));
    }
  });

  await game.start();
  return game;
}
