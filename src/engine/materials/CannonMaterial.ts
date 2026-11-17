/**
 * 砲台材質：對照原版 technique "normal_matCap_mask_changeTexture"
 * （matCapAndNormalMap.vert + matCap_mask_changeTexture.frag）
 *
 *   base = tex；fire.r > 0 時 base = mix(base, fire, u_fireFactor)（過熱發光）
 *   法線貼圖擾動 view-space 法線 → matcap uv → base.rgb += matcap × u_reflectivity
 *   最後 ColorStandardization（tex × multColor + (1 - u_color)）
 */
import * as THREE from 'three';

const vertexShader = /* glsl */ `
#include <common>
#include <skinning_pars_vertex>
varying vec2 vUv;
varying vec3 vViewNormal;
varying vec3 vViewTangent;
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
  #ifdef USE_TANGENT
    vViewTangent = normalize(transformedTangent);
  #else
    vViewTangent = vec3(1.0, 0.0, 0.0);
  #endif
}
`;

const fragmentShader = /* glsl */ `
uniform sampler2D map;
uniform sampler2D uMatcap;
uniform sampler2D uNormalMap;
uniform sampler2D uFire;
uniform float uFireFactor;
uniform float uReflectivity;
uniform float uNormalFactor;
uniform vec4 uColor;
uniform vec3 uMultColor;
varying vec2 vUv;
varying vec3 vViewNormal;
varying vec3 vViewTangent;

void main() {
  vec4 baseColor = texture2D(map, vUv);
  vec4 fireColor = texture2D(uFire, vUv);
  if (fireColor.r > 0.0) baseColor = mix(baseColor, fireColor, uFireFactor);

  vec3 nm = texture2D(uNormalMap, vUv).xyz - vec3(0.5);
  vec3 n = normalize(vViewNormal);
  vec3 t = normalize(vViewTangent);
  vec3 b = normalize(cross(n, t));
  vec3 pn = normalize(nm.x * uNormalFactor * t + nm.y * uNormalFactor * b + nm.z * n);
  vec2 muv = pn.xy * 0.5 + 0.5;
  vec3 matcap = texture2D(uMatcap, muv).rgb;

  vec4 c = vec4(baseColor.rgb + matcap * uReflectivity, baseColor.a);
  c = c * vec4(uMultColor, 1.0) + (vec4(1.0) - uColor);
  gl_FragColor = vec4(c.rgb, c.a * uColor.a);
}
`;

export interface CannonMaterialMaps {
  map: THREE.Texture | null;
  matcap: THREE.Texture | null;
  normalMap: THREE.Texture | null;
  fire: THREE.Texture | null;
}

export class CannonMaterial extends THREE.ShaderMaterial {
  constructor(maps: CannonMaterialMaps, hasTangent: boolean) {
    super({
      uniforms: {
        map: { value: maps.map },
        uMatcap: { value: maps.matcap },
        uNormalMap: { value: maps.normalMap },
        uFire: { value: maps.fire },
        uFireFactor: { value: 0 },
        uReflectivity: { value: maps.matcap ? 1.0 : 0.0 },
        uNormalFactor: { value: 0.8 },
        uColor: { value: new THREE.Vector4(1, 1, 1, 1) },
        uMultColor: { value: new THREE.Vector3(1, 1, 1) },
      },
      vertexShader,
      fragmentShader,
      defines: hasTangent ? { USE_TANGENT: '' } : {},
    });
    this.name = 'CannonMaterial';
  }

  set fireFactor(v: number) {
    this.uniforms.uFireFactor.value = v;
  }
}
