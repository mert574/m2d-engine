/**
 * The Look tab: the lighting cycle and the particle fields of a level.
 *
 * The cycle shows as a strip of the colours it moves through, from the
 * engine's own blend, with a scrubber that previews any phase in the
 * viewport without writing it; a state can be added from what the
 * scrubber shows. Particle fields are sliders that preview while they
 * drag and write one edit on release, like the gizmo.
 */

import { look, isPlainObject, type Op } from 'm2d-editor-core';
import type { Viewport } from './viewport.ts';

export interface LookPanelCallbacks {
  doc(): Record<string, unknown> | null;
  apply(ops: Op[], label: string): void;
  editable(): boolean;
  /** Where a new particle field stands: the camera's target. */
  target(): { x: number; y: number; z: number } | null;
  say(message: string): void;
}

export interface LookPanelHandle {
  refresh(): void;
}

const STRIP_SAMPLES = 48;

interface Slider { key: string; label: string; min: number; max: number; step: number }
const SLIDERS: Slider[] = [
  { key: 'count', label: 'Count', min: 0, max: 4000, step: 10 },
  { key: 'radius', label: 'Radius', min: 0.005, max: 2, step: 0.005 },
  { key: 'opacity', label: 'Opacity', min: 0, max: 1, step: 0.01 },
  { key: 'speed', label: 'Speed', min: 0, max: 5, step: 0.05 },
  { key: 'emissive', label: 'Glow', min: 0, max: 10, step: 0.1 }
];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> & { className?: string } = {}, children: Array<Node | string> = []): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

export function createLookPanel(container: HTMLElement, viewport: Viewport, callbacks: LookPanelCallbacks): LookPanelHandle {
  container.classList.add('look-panel');
  let revealNewField = false;

  const cycleSection = (data: Record<string, unknown>): HTMLElement => {
    const section = el('section', { className: 'look-section' }, [el('h3', { textContent: 'Lighting cycle' })]);
    const world = isPlainObject(data.world) ? data.world : {};
    const cycle = isPlainObject(world.cycle) ? world.cycle : null;
    const states = cycle && Array.isArray(cycle.states) ? cycle.states as Array<{ name?: string }> : [];
    const editable = callbacks.editable();
    if (states.length < 2) {
      section.append(
        el('p', { className: 'hint', textContent: 'No cycle: the level stands in one look.' }),
        el('button', { type: 'button', textContent: 'Start a cycle', disabled: !editable, onclick: () => callbacks.apply(look.startCycle(data), 'Start a lighting cycle') })
      );
      return section;
    }
    const count = states.length;
    const start = typeof cycle!.phase === 'number' ? cycle!.phase : 0;

    const strip = el('div', { className: 'cycle-strip' });
    const samples = look.cycleColours(data, STRIP_SAMPLES);
    const keys = [...new Set(samples.flatMap((sample) => Object.keys(sample.colours)))];
    for (const key of keys) {
      const stops = samples.filter((sample) => sample.colours[key]).map((sample) => `${sample.colours[key]} ${(sample.phase / count) * 100}%`);
      const band = el('span', { className: 'cycle-band' });
      band.style.background = `linear-gradient(to right, ${stops.join(', ')})`;
      strip.append(el('div', { className: 'cycle-row' }, [el('span', { className: 'cycle-key', textContent: key }), band]));
    }
    if (!keys.length) strip.append(el('p', { className: 'hint', textContent: 'The states set no colours; the scrubber still previews what they do set.' }));

    const scrub = el('input', { type: 'range', min: '0', max: String(count), step: '0.01', value: String(start) });
    const readout = el('span', { className: 'cycle-readout' });
    const describe = (phase: number) => {
      const i = Math.floor(phase) % count;
      const t = phase - Math.floor(phase);
      const from = states[i]?.name ?? `state ${i + 1}`;
      const to = states[(i + 1) % count]?.name ?? `state ${((i + 1) % count) + 1}`;
      readout.textContent = t < 0.005 ? `${phase.toFixed(2)} · ${from}` : `${phase.toFixed(2)} · ${from} → ${to}`;
    };
    describe(start);
    scrub.addEventListener('input', () => { const phase = Number(scrub.value); describe(phase); viewport.previewPhase(phase); });

    const chips = el('div', { className: 'cycle-states' }, states.map((state, i) => el('span', { className: `chip${Math.floor(start) === i ? ' start' : ''}` }, [
      el('button', { type: 'button', className: 'chip-name', textContent: state.name ?? `state ${i + 1}`, title: 'Preview this state', onclick: () => { scrub.value = String(i); describe(i); viewport.previewPhase(i); } }),
      el('button', { type: 'button', className: 'chip-remove', textContent: '×', title: 'Remove this state', disabled: !editable || count <= 2, onclick: () => {
        try { callbacks.apply(look.removeState(data, i), `Remove cycle state ${state.name ?? i + 1}`); } catch (error) { callbacks.say(String((error as Error).message ?? error)); }
      } })
    ])));

    section.append(strip, el('div', { className: 'cycle-scrub' }, [scrub, readout]), chips, el('div', { className: 'look-actions' }, [
      el('button', { type: 'button', textContent: 'Set as start', title: 'Write this phase as world.cycle.phase', disabled: !editable, onclick: () => callbacks.apply([{ op: 'set', path: ['world', 'cycle', 'phase'], value: Math.round(Number(scrub.value) * 100) / 100 }], 'Set the cycle\'s start') }),
      el('button', { type: 'button', textContent: 'Add state here', title: 'Insert the look shown as a new state', disabled: !editable, onclick: () => {
        const name = prompt('State name', 'state');
        if (name) callbacks.apply(look.addStateAt(data, Number(scrub.value), name), `Add cycle state ${name}`);
      } }),
      el('button', { type: 'button', textContent: 'Back to the document', onclick: () => { scrub.value = String(start); describe(start); viewport.previewPhase(null); } })
    ]));
    return section;
  };

  const particlesSection = (data: Record<string, unknown>): HTMLElement => {
    const section = el('section', { className: 'look-section' }, [el('h3', { textContent: 'Particles' })]);
    if (viewport.dimensions !== 3) {
      section.append(el('p', { className: 'hint', textContent: 'Particle fields draw in 3D levels.' }));
      return section;
    }
    const world = isPlainObject(data.world) ? data.world : {};
    const fields = Array.isArray(world.particles) ? world.particles as Record<string, unknown>[] : [];
    const editable = callbacks.editable();
    fields.forEach((field, index) => {
      const full = look.particleField(field);
      const card = el('div', { className: 'particle-card' }, [el('h4', { textContent: `${String(full.kind)} ${index + 1}` })]);
      const preview = (key: string, value: unknown) => viewport.previewParticles(fields.map((each, i) => (i === index ? { ...each, [key]: value } : each)));
      const commit = (key: string, value: unknown) => callbacks.apply([{ op: 'set', path: ['world', 'particles', index, key], value }], `Particles: ${key}`);
      for (const slider of SLIDERS) {
        const input = el('input', { type: 'range', min: String(slider.min), max: String(slider.max), step: String(slider.step), value: String(full[slider.key]), disabled: !editable });
        const shown = el('span', { className: 'value', textContent: String(full[slider.key]) });
        input.addEventListener('input', () => { shown.textContent = input.value; preview(slider.key, Number(input.value)); });
        input.addEventListener('change', () => commit(slider.key, Number(input.value)));
        card.append(el('label', { className: 'slider' }, [el('span', { textContent: slider.label }), input, shown]));
      }
      const colour = el('input', { type: 'color', value: String(full.color).length === 7 ? String(full.color) : '#ffffff', disabled: !editable });
      colour.addEventListener('input', () => preview('color', colour.value));
      colour.addEventListener('change', () => commit('color', colour.value));
      card.append(el('label', { className: 'slider' }, [el('span', { textContent: 'Colour' }), colour]));
      card.append(el('button', { type: 'button', className: 'danger', textContent: 'Remove', disabled: !editable, onclick: () => callbacks.apply([{ op: 'remove', path: ['world', 'particles'], index }], `Remove particle field ${index + 1}`) }));
      section.append(card);
    });
    const add = (kind: 'motes' | 'smoke') => {
      const at = callbacks.target() ?? { x: 0, y: 0, z: 0 };
      revealNewField = true;
      callbacks.apply(look.addParticleField(data, kind, at), `Add ${kind}`);
    };
    section.append(el('div', { className: 'look-actions' }, [
      el('button', { type: 'button', textContent: 'Add motes', disabled: !editable, onclick: () => add('motes') }),
      el('button', { type: 'button', textContent: 'Add smoke', title: 'Rising from the camera\'s target', disabled: !editable, onclick: () => add('smoke') })
    ]));
    return section;
  };

  const refresh = (): void => {
    const data = callbacks.doc();
    const scrolled = container.scrollTop;
    container.replaceChildren();
    if (!data || data.type !== 'level') {
      container.append(el('p', { className: 'hint', textContent: 'A level\'s lighting cycle and particles edit here.' }));
      return;
    }
    container.append(cycleSection(data), particlesSection(data));
    container.scrollTop = scrolled;
    if (revealNewField) {
      revealNewField = false;
      [...container.querySelectorAll('.particle-card')].at(-1)?.scrollIntoView({ block: 'nearest' });
    }
  };

  return { refresh };
}
