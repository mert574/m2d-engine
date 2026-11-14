import { UIElement } from 'm2d-engine/core/ui/uiElement.js';
import { lapTime } from './menuParts.js';

/** Seconds a checkpoint's split stays up. */
const SPLIT_SECONDS = 2.6;
const AHEAD = '#2f7cf6';
const BEHIND = '#e5483d';
const INK = '#f4f6fb';
const MUTED = 'rgba(214, 220, 236, 0.7)';
const OUTLINE = { color: 'rgba(0, 0, 0, 0.75)', blur: 6, offsetX: 0, offsetY: 1 };

/**
 * The live readout, laid out as Trackmania's: the race time large at the
 * bottom centre with the speed under it, the split against the best lap
 * flashed at each checkpoint, the checkpoint count at the bottom right,
 * the best and last laps under the circuit's name. All of it is the race
 * director's state, read each frame; the circuit's name and the controls
 * line are the scene's own text.
 */
export class RaceHud extends UIElement {
  constructor(scene, options = {}) {
    const { properties, ...placement } = options;
    super({ anchor: 'top-left', pivot: 'top-left', x: 0, y: 0, width: 0, height: 0, ...placement });
    this.scene = scene;
  }

  get race() {
    if (this.director && !this.director.dead) return this.director;
    this.director = [...this.scene.game.entities].find((entity) => entity.name === 'RaceDirector') ?? null;
    return this.director;
  }

  #time(ticks) {
    return lapTime(ticks * this.scene.game.time.fixedTimestep);
  }

  draw() {
    const race = this.race;
    if (!race?.car) return;
    const view = this.parentBox;
    const centre = view.x + view.width / 2;
    const bottom = view.y + view.height;

    this.#laps(race, view.x + 20, view.y + 44);
    this.#clock(race, centre, bottom - 118);
    this.#speed(race.car.drive, centre, bottom - 70);
    this.#checkpoints(race, view.x + view.width - 24, bottom - 52);
    this.#split(race, centre, view.y + view.height * 0.3);
    this.#callouts(race, centre, view.y + view.height / 2);
  }

  #text(text, x, y, style) {
    this.paint.drawText({ text, x, y, fillStyle: INK, textBaseline: 'middle', shadow: OUTLINE, ...style });
  }

  #laps(race, x, y) {
    const best = race.best ? `BEST  ${this.#time(race.best.lapTicks)}` : 'NO BEST YET';
    const last = race.lastLapTicks ? `     LAST  ${this.#time(race.lastLapTicks)}` : '';
    this.#text(best + last, x, y, { fillStyle: MUTED, fontSize: '$font.size.caption', letterSpacing: 2, textAlign: 'left' });
  }

  #clock(race, x, y) {
    const ticks = race.lapTicks ?? 0;
    this.#text(this.#time(ticks), x, y, { fontFamily: '$font.mono', fontSize: 44, fontWeight: '600', textAlign: 'center' });
  }

  /** The speed, and the nitro as a thin bar under it: full when it would ignite. */
  #speed(drive, x, y) {
    const kmh = String(Math.round(drive.speed * 0.36));
    this.#text(kmh, x + 6, y, { fontFamily: '$font.mono', fontSize: 26, fontWeight: '600', textAlign: 'right' });
    this.#text('KM/H', x + 14, y + 4, { fillStyle: MUTED, fontSize: '$font.size.micro', letterSpacing: 2, textAlign: 'left' });

    const fill = drive.boostLeft > 0 ? drive.boostLeft / drive.nitroDuration
      : drive.nitroCooldown > 0 ? 1 - drive.nitroWait / drive.nitroCooldown : 1;
    const width = 120;
    this.paint.drawRect({ x: x - width / 2, y: y + 22, width, height: 3, fillStyle: 'rgba(255, 255, 255, 0.16)' });
    this.paint.drawRect({
      x: x - width / 2, y: y + 22, width: width * Math.max(0, fill), height: 3,
      fillStyle: drive.boostLeft > 0 ? '#9fd8ff' : drive.nitroReady ? '#3fb4ff' : 'rgba(255, 255, 255, 0.45)'
    });
  }

  #checkpoints(race, x, y) {
    if (!race.checkpoints) return;
    this.#text(`${race.nextCheckpoint} / ${race.checkpoints}`, x, y, { fontFamily: '$font.mono', fontSize: 22, fontWeight: '600', textAlign: 'right' });
    this.#text('CHECKPOINTS', x, y + 22, { fillStyle: MUTED, fontSize: '$font.size.micro', letterSpacing: 2, textAlign: 'right' });
  }

  /** The time at the checkpoint just crossed (or the line) and, against the best lap's, a blue or red delta. */
  #split(race, x, y) {
    const split = race.split;
    if (!split) return;
    const age = (this.scene.game.time.steps - split.step) * this.scene.game.time.fixedTimestep;
    if (age > SPLIT_SECONDS) return;
    const fade = Math.min(1, (SPLIT_SECONDS - age) / 0.3);
    this.#text(this.#time(split.ticks), x, y, { fontFamily: '$font.mono', fontSize: 28, fontWeight: '600', textAlign: 'center', globalAlpha: fade });
    if (split.delta === null) return;
    const seconds = split.delta * this.scene.game.time.fixedTimestep;
    const text = `${seconds <= 0 ? '−' : '+'}${Math.abs(seconds).toFixed(2)}`;
    const width = 96;
    this.paint.drawRect({ x: x - width / 2, y: y + 22, width, height: 28, fillStyle: seconds <= 0 ? AHEAD : BEHIND, globalAlpha: fade, cornerRadius: 3 });
    this.paint.drawText({
      text, x, y: y + 36, fillStyle: INK, fontFamily: '$font.mono', fontSize: 18, fontWeight: '600',
      textAlign: 'center', textBaseline: 'middle', globalAlpha: fade
    });
  }

  /** The countdown, a new best, and the wrong-way warning. */
  #callouts(race, x, y) {
    if (race.announcement) {
      this.#text(race.announcement, x, y - 130, { fillStyle: '#ffd34d', fontSize: 30, fontWeight: '700', letterSpacing: 3, textAlign: 'center' });
    }
    if (race.wrongWayFor > 0.7) {
      this.#text('WRONG WAY', x, y - 80, { fillStyle: BEHIND, fontSize: 22, fontWeight: '700', letterSpacing: 3, textAlign: 'center' });
    }
  }
}
