/**
 * 平面陰影：對照原版 shader_3d_skin_position_tex_z0.vert + shader_3d_shadow.frag（technique "shadow" 的 shadow pass）
 *
 *   p = 世界座標（已蒙皮）; p.x -= p.z*0.3; p.y += p.z*0.8; p.z = min(0.1, p.z)
 *   顏色 = 場景陰影色，alpha = u_color.a × 0.45
 *   renderState：depthWrite off、alpha blend、stencil 128 NOTEQUAL / REPLACE（同一像素只暗一次）
 */
import * as THREE from 'three';

export const SHADOW_ALPHA = 0.45;

const vertexShader = /* glsl */ `
#include <common>
#include <skinning_pars_vertex>
void main() {
  #include <skinbase_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  vec4 wp = modelMatrix * vec4(transformed, 1.0);
  wp.x -= wp.z * 0.3;
  wp.y += wp.z * 0.8;
  wp.z = min(0.1, wp.z);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const fragmentShader = /* glsl */ `
uniform vec3 uShadowColor;
uniform float uAlpha;
void main() {
  gl_FragColor = vec4(uShadowColor, uAlpha);
}
`;

export class PlanarShadowMaterial extends THREE.ShaderMaterial {
  constructor(shadowColor: THREE.Color | [number, number, number]) {
    const c = Array.isArray(shadowColor) ? new THREE.Vector3(...shadowColor) : new THREE.Vector3(shadowColor.r, shadowColor.g, shadowColor.b);
    super({
      uniforms: {
        uShadowColor: { value: c },
        uAlpha: { value: SHADOW_ALPHA },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      stencilWrite: true,
      stencilRef: 128,
      stencilFuncMask: 128,
      stencilWriteMask: 128,
      stencilFunc: THREE.NotEqualStencilFunc,
      stencilZPass: THREE.ReplaceStencilOp,
      stencilFail: THREE.KeepStencilOp,
      stencilZFail: THREE.KeepStencilOp,
    });
    this.name = 'PlanarShadowMaterial';
  }

  /** 換場景時更新陰影色（原版 ModelMgr:setShadowColor） */
  setShadowColor(c: readonly [number, number, number]): void {
    (this.uniforms.uShadowColor.value as THREE.Vector3).set(c[0], c[1], c[2]);
  }

  /** 跟著魚的 u_color.a 淡出 */
  set opacityFactor(a: number) {
    this.uniforms.uAlpha.value = SHADOW_ALPHA * a;
  }
}
