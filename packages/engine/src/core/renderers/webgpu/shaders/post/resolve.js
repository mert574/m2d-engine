import { COMMON } from '../chunks/frame.js';
import { POST_COMMON } from './chunks.js';

/** Direct plus occluded indirect light, then fog by depth: the lit frame. */
export const RESOLVE_SHADER = /* wgsl */ `
${COMMON}
${POST_COMMON}
@group(1) @binding(2) var indirect: texture_2d<f32>;
@group(1) @binding(3) var ao: texture_2d<f32>;
@group(1) @binding(4) var normalDepth: texture_2d<f32>;

@fragment
fn fs(in: PostOut) -> @location(0) vec4f {
  let direct = textureSampleLevel(source, sourceSampler, in.uv, 0.0).rgb;
  let ambient = textureSampleLevel(indirect, sourceSampler, in.uv, 0.0).rgb;
  var occlusion = 1.0;
  if (frame.post[0].w > 0.5) { occlusion = textureSampleLevel(ao, sourceSampler, in.uv, 0.0).r; }
  var color = direct + ambient * occlusion;
  let depth = textureSampleLevel(normalDepth, sourceSampler, in.uv, 0.0).w;
  if (depth > 0.0) {
    let distance = length(viewPosition(in.uv, depth));
    let fogAmount = 1.0 - exp(-frame.fog.w * distance);
    color = mix(color, frame.fog.rgb, fogAmount);
  }
  return vec4f(color, 1.0);
}
`;
