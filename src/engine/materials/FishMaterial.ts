/**
 * 魚身材質：對照原版 shader_3d_skin_position_tex.vert + shader_3d_color_tex.frag
 *
 *   addColor = 1 - u_color
 *   c = tex × u_multColor + addColor
 *   受擊反白（bleach）：mix(c, vec3(scalar), rate × pow(1 - n·v, pow))
 *   alpha = c.a × u_color.a
 *
 * 原版 v_viewNormal 實際是世界法線、再與相機 back 軸內積；這裡直接用 view-space 法線的 z，等價。
 */
import * as THREE from 'three';

export const FISH_BLEACH_DEFAULT = { pow: 3.5, scalar: 1.7 };

const vertexShader = /* glsl */ `
#include <common>
#include <skinning_pars_vertex>
varying vec2 vUv;
varying vec3 vViewNormal;
void main() {
  vUv = uv;
  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <defaultnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  #include <project_vertex>
  vViewNormal = normalize(transformedNormal);
}
`;

const fragmentShader = /* glsl */ `
uniform sampler2D map;
uniform vec4 uColor;
uniform vec3 uMultColor;
uniform float uBleachRate;
uniform float uBleachPow;
uniform float uBleachScalar;
uniform float uAlphaTest;
varying vec2 vUv;
varying vec3 vViewNormal;

vec3 applyBleach(vec3 oldColor, float lerpValue) {
  float nDotV = dot(normalize(vViewNormal), vec3(0.0, 0.0, 1.0));
  float theta = 1.0 - min(nDotV, 1.0);
  return mix(oldColor, vec3(uBleachScalar), lerpValue * pow(max(theta, 0.0), uBleachPow));
}

void main() {
  vec4 tex = texture2D(map, vUv);
  if (tex.a < uAlphaTest) discard;
  vec4 addColor = vec4(1.0) - uColor;
  vec4 c = tex * vec4(uMultColor, 1.0) + addColor;
  if (uBleachRate > 0.0) c.rgb = applyBleach(c.rgb, uBleachRate);
  gl_FragColor = vec4(c.rgb, c.a * uColor.a);
}
`;

export class FishMaterial extends THREE.ShaderMaterial {
  constructor(map: THREE.Texture | null) {
    super({
      uniforms: {
        map: { value: map },
        uColor: { value: new THREE.Vector4(1, 1, 1, 1) },
        uMultColor: { value: new THREE.Vector3(1, 1, 1) },
        uBleachRate: { value: 0 },
        uBleachPow: { value: FISH_BLEACH_DEFAULT.pow },
        uBleachScalar: { value: FISH_BLEACH_DEFAULT.scalar },
        uAlphaTest: { value: 0.1 },
      },
      vertexShader,
      fragmentShader,
    });
    this.name = 'FishMaterial';
  }

  set bleachRate(v: number) {
    this.uniforms.uBleachRate.value = v;
  }
  get bleachRate(): number {
    return this.uniforms.uBleachRate.value;
  }

  /** Cocos setOpacity（0..1）；<1 時切到透明佇列 */
  set alpha(a: number) {
    (this.uniforms.uColor.value as THREE.Vector4).w = a;
    const t = a < 0.999;
    if (this.transparent !== t) this.transparent = t;
  }
  get alpha(): number {
    return (this.uniforms.uColor.value as THREE.Vector4).w;
  }

  setBleachParams(pow: number, scalar: number): void {
    this.uniforms.uBleachPow.value = pow;
    this.uniforms.uBleachScalar.value = scalar;
  }
}
