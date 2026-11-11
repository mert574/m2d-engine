import { describe, it, expect } from 'vitest';
import { Document } from '@gltf-transform/core';
import { cardsOf, foliageLevel } from '../src/pipeline/foliage.mjs';

/**
 * A primitive of leaf cards. Each card is a 2x2 grid of quads (eight
 * triangles) whose uvs map linearly onto its position; `fold` lifts the
 * card's centre vertex out of its plane.
 */
function leaves(cards: { x: number; fold?: number; color?: number[] }[]) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const p: number[] = [], n: number[] = [], uv: number[] = [], c: number[] = [], idx: number[] = [];
  for (const card of cards) {
    const base = p.length / 3;
    for (let j = 0; j <= 2; j++) {
      for (let i = 0; i <= 2; i++) {
        const lift = i === 1 && j === 1 ? card.fold ?? 0 : 0;
        p.push(card.x + i * 0.05, j * 0.05, lift);
        n.push(0, 0, 1);
        uv.push(i / 2, 1 - j / 2);
        c.push(...(card.color ?? [1, 1, 1, 1]));
      }
    }
    for (let j = 0; j < 2; j++) {
      for (let i = 0; i < 2; i++) {
        const a = base + j * 3 + i;
        idx.push(a, a + 1, a + 4, a, a + 4, a + 3);
      }
    }
  }
  const acc = (array: any, type: 'VEC2' | 'VEC3' | 'VEC4' | 'SCALAR') => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
  const material = doc.createMaterial('leaves').setAlphaMode('MASK');
  const prim = doc.createPrimitive().setMaterial(material)
    .setAttribute('POSITION', acc(new Float32Array(p), 'VEC3'))
    .setAttribute('NORMAL', acc(new Float32Array(n), 'VEC3'))
    .setAttribute('TEXCOORD_0', acc(new Float32Array(uv), 'VEC2'))
    .setAttribute('COLOR_0', acc(new Float32Array(c), 'VEC4'))
    .setIndices(acc(new Uint16Array(idx), 'SCALAR'));
  const mesh = doc.createMesh().addPrimitive(prim);
  return { doc, mesh, prim };
}

describe('foliage levels', () => {
  it('finds each leaf card as one connected piece', () => {
    const { prim } = leaves([{ x: 0 }, { x: 1 }, { x: 2 }]);
    expect(cardsOf(prim).map((card: number[]) => card.length)).toEqual([8, 8, 8]);
  });

  it('turns a flat card into one quad over its texture rectangle, carrying its colour', () => {
    const { doc, mesh, prim } = leaves([{ x: 0, color: [0.2, 0.4, 0.6, 1] }]);
    const quads = foliageLevel(doc, mesh, prim, { quads: true })!;
    // Eight triangles in, two out, and nothing left on the source.
    expect(quads.getIndices()!.getCount()).toBe(6);
    expect(prim.getIndices()!.getCount()).toBe(0);
    // The corners sit where the card's own corners are.
    const position = quads.getAttribute('POSITION')!.getArray()!;
    const xs = [0, 3, 6, 9].map((i) => position[i]!), ys = [1, 4, 7, 10].map((i) => position[i]!);
    expect(Math.min(...xs)).toBeCloseTo(0, 5); expect(Math.max(...xs)).toBeCloseTo(0.1, 5);
    expect(Math.min(...ys)).toBeCloseTo(0, 5); expect(Math.max(...ys)).toBeCloseTo(0.1, 5);
    const normal = quads.getAttribute('NORMAL')!.getElement(0, []);
    expect(normal[0]).toBeCloseTo(0, 6); expect(normal[1]).toBeCloseTo(0, 6); expect(normal[2]).toBeCloseTo(1, 6);
    expect(quads.getAttribute('COLOR_0')!.getElement(2, []).map((v: number) => Math.round(v * 10) / 10)).toEqual([0.2, 0.4, 0.6, 1]);
  });

  it('winds each quad to face the way its normal does, whichever way its texture runs', () => {
    // The fixture's uv v runs down while y runs up: the texture's own order
    // winds the quad against its +z normal.
    const { doc, mesh, prim } = leaves([{ x: 0 }]);
    const quads = foliageLevel(doc, mesh, prim, { quads: true })!;
    const p = quads.getAttribute('POSITION')!.getArray()!;
    const i = quads.getIndices()!.getArray()!;
    const at = (k: number) => [p[i[k]! * 3]!, p[i[k]! * 3 + 1]!, p[i[k]! * 3 + 2]!];
    for (const t of [0, 3]) {
      const [a, b, c] = [at(t), at(t + 1), at(t + 2)];
      const z = (b[0]! - a[0]!) * (c[1]! - a[1]!) - (b[1]! - a[1]!) * (c[0]! - a[0]!);
      expect(z, `triangle ${t / 3} faces +z`).toBeGreaterThan(0);
    }
  });

  it('keeps a card too folded to be a quad as triangles', () => {
    const { doc, mesh, prim } = leaves([{ x: 0 }, { x: 1, fold: 0.15 }]);
    const quads = foliageLevel(doc, mesh, prim, { quads: true })!;
    expect(quads.getIndices()!.getCount()).toBe(6);
    expect(prim.getIndices()!.getCount()).toBe(24);
  });

  it('thins to a share of the cards, the same ones every build, and grows the survivors', () => {
    const many = Array.from({ length: 200 }, (_, i) => ({ x: i }));
    const kept = () => {
      const { doc, mesh, prim } = leaves(many);
      const quads = foliageLevel(doc, mesh, prim, { quads: true, keep: 0.25, grow: 2 })!;
      const position = quads.getAttribute('POSITION')!.getArray()!;
      return { count: quads.getIndices()!.getCount() / 6, first: [...position.slice(0, 12)] };
    };
    const a = kept(), b = kept();
    expect(a.count).toBeGreaterThan(30);
    expect(a.count).toBeLessThan(70);
    expect(b).toEqual(a);
    // Twice the size about its centre: 0.2 across instead of 0.1.
    const xs = [0, 3, 6, 9].map((i) => a.first[i]!);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(0.2, 5);
  });
});
