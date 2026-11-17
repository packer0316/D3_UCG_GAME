// 原版魚 EFK 設定（View/GameView/Fish/<魚>/<魚>EfkSetting.lua）→ JSON（SPEC §14.2）
//
//   { BodyEfk = {...}, WithActEfk = { <anim> = { { Efk = {File, Position, Rotation, Scale, Speed, Duration, Delay},
//                                                  BoneName, Sound = {Source, Delay, Duration}, ShockWorld = {Times, Delta} } } } }
//   →
//   { bodyEfk?: Entry[], withActEfk?: { [anim]: Entry[] }, other?: { [name]: Entry[] } }
//
// 檔案路徑去掉 Res_Path 前綴（"DragonTycoon3Resource/"）；音效 Source 以 SoundDefine.lua 轉成 "sound/xxx"。
import { parseLuaAssignment } from './lua-table.mjs';

export const RES_PATH = 'DragonTycoon3Resource';

/** 解析 Define/SoundDefine.lua 的 fishG.SoundTable */
export function parseSoundTable(src) {
  return parseLuaAssignment(src, 'fishG.SoundTable') ?? {};
}

function makeResolver(soundTable, warnings) {
  return (path) => {
    if (path === 'fishG.Res_Path' || path === 'dragonT.Res_Path') return RES_PATH;
    const m = /^(?:fishG|dragonT)\.SoundTable\.(\w+)$/.exec(path);
    if (m) {
      if (soundTable[m[1]] !== undefined) return soundTable[m[1]];
      warnings.push(`unknown sound ${m[1]}`);
      return null;
    }
    warnings.push(`unresolved ${path}`);
    return { $ref: path };
  };
}

const stripRes = (p) => (typeof p === 'string' ? p.replace(/^\/?DragonTycoon3Resource\//, '').replace(/^\//, '') : p);

function clean(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null));
}

function normEfk(e) {
  if (!e || typeof e !== 'object') return undefined;
  return clean({
    file: stripRes(e.File),
    position: e.Position,
    rotation: e.Rotation,
    scale: e.Scale,
    speed: e.Speed,
    duration: e.Duration,
    delay: e.Delay,
    maxConcurrent: e.MaxConcurrent,
  });
}

function normEntries(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((e) => e && typeof e === 'object')
    .map((e) =>
      clean({
        efk: normEfk(e.Efk),
        bone: e.BoneName,
        sound:
          e.Sound && e.Sound.Source
            ? clean({ source: e.Sound.Source, delay: e.Sound.Delay, duration: e.Sound.Duration })
            : undefined,
        shockWorld: e.ShockWorld ? clean({ times: e.ShockWorld.Times, delta: e.ShockWorld.Delta }) : undefined,
      }),
    )
    .filter((e) => e.efk || e.sound || e.shockWorld);
}

function normMap(map) {
  if (!map || typeof map !== 'object' || Array.isArray(map)) return undefined;
  const out = {};
  for (const [k, v] of Object.entries(map)) {
    const entries = normEntries(v);
    if (entries.length) out[k] = entries;
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * @param src Lua 原始碼
 * @param soundTable parseSoundTable 的結果
 * @param anims 只保留這些動畫的 WithActEfk（null = 全部；有指定時捨棄 OtherEfkSetting）
 * @returns {{ json: object, efkFiles: string[], sounds: string[], warnings: string[] }}
 */
export function convertFishEfkSetting(src, soundTable, anims = null) {
  const warnings = [];
  const ret = /\breturn\s+([A-Za-z_][\w.]*)\s*$/.exec(src.trim());
  const name = ret?.[1] ?? 'FishEfkSetting';
  const raw = parseLuaAssignment(src, name, makeResolver(soundTable, warnings));
  if (!raw || typeof raw !== 'object') throw new Error(`找不到 ${name} = { ... }`);

  let withAct = normMap(raw.WithActEfk);
  if (withAct && anims) {
    withAct = Object.fromEntries(Object.entries(withAct).filter(([k]) => anims.includes(k)));
    if (!Object.keys(withAct).length) withAct = undefined;
  }
  const json = clean({
    bodyEfk: raw.BodyEfk ? normEntries(raw.BodyEfk) : undefined,
    withActEfk: withAct,
    other: anims ? undefined : normMap(raw.OtherEfkSetting),
  });

  const efkFiles = new Set();
  const sounds = new Set();
  const visit = (entries) =>
    entries?.forEach((e) => {
      if (e.efk?.file) efkFiles.add(e.efk.file);
      if (e.sound?.source) sounds.add(e.sound.source);
    });
  visit(json.bodyEfk);
  for (const group of [json.withActEfk, json.other]) if (group) Object.values(group).forEach(visit);
  return { json, efkFiles: [...efkFiles], sounds: [...sounds], warnings };
}
