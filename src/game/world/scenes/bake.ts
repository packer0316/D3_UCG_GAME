/**
 * GPU 烘焙貼圖（SPEC §18.3）：把程序化圖樣畫到 render target，執行時只取樣貼圖。
 * 圖樣寫成可平鋪的（GLSL_NOISE 的 pnoise / pfbm、格點取餘數），所以貼圖用 repeat。
 */
import * as THREE from 'three';
import { GLSL_NOISE } from './ProcMaterial';

export interface BakeOptions {
  size: number;
  /** GLSL：必須定義 vec4 bake(vec2 uv)（uv 0 ~ 1，原點左下） */
  fragment: string;
  uniforms?: Record<string, THREE.IUniform>;
  /** 省略 = repeat */
  wrap?: THREE.Wrapping;
  /** 給之後的烘焙當資料讀（例如高度圖）：不要 mipmap、最近點取樣以外用線性即可 */
  data?: boolean;
}

const BAKE_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/** 16 位元數值 ↔ RG 兩個 8 位元通道（高度圖用） */
export const GLSL_PACK16 = /* glsl */ `
vec2 pack16(float v) {
  v = clamp(v, 0.0, 1.0) * 65535.0;
  float hi = floor(v / 256.0);
  return vec2(hi, v - hi * 256.0) / 255.0;
}
float unpack16(vec2 rg) {
  return (rg.x * 255.0 * 256.0 + rg.y * 255.0) / 65535.0;
}
`;

export function bakeTexture(renderer: THREE.WebGLRenderer, opts: BakeOptions): THREE.Texture {
  const wrap = opts.wrap ?? THREE.RepeatWrapping;
  const rt = new THREE.WebGLRenderTarget(opts.size, opts.size, {
    depthBuffer: false,
    generateMipmaps: !opts.data,
    minFilter: opts.data ? THREE.LinearFilter : THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: wrap,
    wrapT: wrap,
    colorSpace: THREE.NoColorSpace,
  });
  if (!opts.data) rt.texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const material = new THREE.ShaderMaterial({
    uniforms: opts.uniforms ?? {},
    vertexShader: BAKE_VERTEX,
    fragmentShader: `varying vec2 vUv;\n${GLSL_NOISE}\n${GLSL_PACK16}\n${opts.fragment}\nvoid main() { gl_FragColor = bake(vUv); }`,
    depthTest: false,
    depthWrite: false,
  });
  const geometry = new THREE.PlaneGeometry(2, 2);
  const quad = new THREE.Mesh(geometry, material);
  quad.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(quad);

  const prevTarget = renderer.getRenderTarget();
  renderer.setRenderTarget(rt);
  renderer.clear();
  renderer.render(scene, new THREE.Camera());
  renderer.setRenderTarget(prevTarget);
  geometry.dispose();
  material.dispose();
  return rt.texture;
}
