/**
 * The Look tab: the lighting cycle of a level.
 *
 * The cycle shows as a strip of the colours it moves through, from the
 * engine's own blend, with a scrubber that previews any phase in the
 * viewport without writing it; a state can be added from what the
 * scrubber shows. (A sky, particles and ambient sound are scenery actors,
 * placed from the Components tab and edited in the inspector.)
 */

import { look, isPlainObject, type Op } from 'm2d-editor-core';
import type { Viewport } from './viewport.ts';

export interface LookPanelCallbacks {
  doc(): Record<string, unknown> | null;
  apply(ops: Op[], label: string): void;
  editable(): boolean;
  say(message: string): void;
}

export interface LookPanelHandle {
  refresh(): void;
}

const STRIP_SAMPLES = 48;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> & { className?: string } = {}, children: Array<Node | string> = []): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

export function createLookPanel(container: HTMLElement, viewport: Viewport, callbacks: LookPanelCallbacks): LookPanelHandle {
  container.classList.add('look-panel');

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

  const refresh = (): void => {
    const data = callbacks.doc();
    const scrolled = container.scrollTop;
    container.replaceChildren();
    if (!data || data.type !== 'level') {
      container.append(el('p', { className: 'hint', textContent: 'A level\'s lighting cycle edits here.' }));
      return;
    }
    container.append(cycleSection(data));
    container.scrollTop = scrolled;
  };

  return { refresh };
}
