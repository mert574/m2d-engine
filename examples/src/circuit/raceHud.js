import { UIElement } from 'm2d-engine/core/ui/uiElement.js';

/**
 * The circuit's live readout: the lap clock, the best and last laps, the
 * speed, the nitro gauge, the announcer's line and the wrong-way warning.
 *
 * Everything on it is the race director's state, read each frame. The
 * fixed parts of the HUD — the circuit's name, the KM/H label, the
 * controls line — are the scene's own text elements; this is only what
 * changes while driving.
 */
export class RaceHud extends UIElement {
  /**
   * @param {import('m2d-engine/core/scene.js').Scene} scene
   * @param {object} options - The HUD element's placement and properties
   */
  constructor(scene, options = {}) {
    const { properties, ...placement } = options;
    super({ anchor: 'top-left', pivot: 'top-left', x: 0, y: 0, width: 0, height: 0, ...placement });
    this.scene = scene;
  }

  /** The director that is running this circuit. */
  get race() {
    if (this.director && !this.director.dead) return this.director;
    this.director = [...this.scene.game.entities].find((entity) => entity.name === 'RaceDirector') ?? null;
    return this.director;
  }

  /** A lap time as minutes and hundredths, from ticks — never from wall time. */
  #clock(ticks) {
    const seconds = ticks * this.scene.game.time.fixedTimestep;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${(seconds - minutes * 60).toFixed(2).padStart(5, '0')}`;
  }

  draw() {
    const race = this.race;
    const car = race?.car;
    if (!car) return;
    const paint = this.paint;
    const view = this.parentBox;
    const right = view.x + view.width - 20;

    paint.drawText({
      x: view.x + 20, y: view.y + 42, text: race.lapTicks === null ? '0:00.00' : this.#clock(race.lapTicks),
      fillStyle: '#eef1f8', fontSize: 30, fontWeight: '700', textBaseline: 'top'
    });
    paint.drawText({
      x: view.x + 20, y: view.y + 78, textBaseline: 'top', fillStyle: '#9fb0cc', fontSize: 14,
      text: (race.best ? `best ${this.#clock(race.best.lapTicks)}` : 'no best yet')
        + (race.lastLapTicks ? ` · last ${this.#clock(race.lastLapTicks)}` : '')
        + (race.spills.length ? ` · oil on track: ${race.spills.length}` : '')
    });
    paint.drawText({
      x: right, y: view.y + 42, text: String(Math.round(car.drive.speed * 0.36)),
      fillStyle: '#eef1f8', fontSize: 30, fontWeight: '700', textAlign: 'right', textBaseline: 'top'
    });

    this.#gauge(car.drive, right - 150, view.y + 78);

    if (race.announcement) {
      paint.drawText({
        x: view.x + view.width / 2, y: view.y + view.height / 2 - 130, text: race.announcement,
        fillStyle: '#ffd34d', fontSize: 34, fontWeight: '700', letterSpacing: 3,
        textAlign: 'center', textBaseline: 'middle'
      });
    }
    if (race.wrongWayFor > 0.7) {
      paint.drawText({
        x: view.x + view.width / 2, y: view.y + view.height / 2 - 80, text: 'WRONG WAY',
        fillStyle: '#ff5a4e', fontSize: 22, fontWeight: '700', textAlign: 'center', textBaseline: 'middle'
      });
    }
  }

  /** The nitro gauge: a bar that drains on ignition and refills on cooldown. */
  #gauge(drive, x, y) {
    const fill = drive.boostLeft > 0
      ? drive.boostLeft / drive.nitroDuration
      : 1 - drive.nitroWait / drive.nitroCooldown;
    this.paint.drawRect({ x, y, width: 150, height: 10, fillStyle: 'rgba(16, 20, 34, 0.7)', cornerRadius: 3 });
    this.paint.drawRect({
      x: x + 2, y: y + 2, width: Math.max(0, 146 * fill), height: 6,
      fillStyle: drive.nitroReady ? '#39c2ff' : drive.boostLeft > 0 ? '#a7e0ff' : '#4a5a74',
      cornerRadius: 2
    });
  }
}
