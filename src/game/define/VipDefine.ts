/**
 * VIP 卡圖 — 對照 Inanna Define.lua（VIP_LV / VipResource）與 GlobalFunc.lua LoadVipCardSprite
 * 圖集來自 Inanna 平台資源 vip/VIPCards.plist（asset-manifest：inanna:vip/VIPCards.plist）
 */
export const VIP_CARD_PLIST = 'vip/VIPCards.plist';

export const VipLevel = {
  VIP_0: 0, // 無VIP資格
  VIP_1: 1, // 普VIP
  VIP_2: 2, // 銀VIP
  VIP_3: 3, // 金VIP
  VIP_4: 4, // 鑽VIP
  VIP_5: 5, // 黑VIP
  VIP_6: 6, // 紫金VIP
  VIP_7: 7,
  SVIP_1: 11, // 超級VIP1
  SVIP_2: 12, // 超級VIP2
  SVIP_3: 13, // 超級VIP3
} as const;

const CARD_IMAGE: Record<number, string> = {
  [VipLevel.VIP_0]: 'vip/img/VIP_card_big/VIP_0.png',
  [VipLevel.VIP_1]: 'vip/img/VIP_card_big/VIP_1.png',
  [VipLevel.VIP_2]: 'vip/img/VIP_card_big/VIP_2.png',
  [VipLevel.VIP_3]: 'vip/img/VIP_card_big/VIP_3.png',
  [VipLevel.VIP_4]: 'vip/img/VIP_card_big/VIP_4.png',
  [VipLevel.VIP_5]: 'vip/img/VIP_card_big/VIP_5.png',
  [VipLevel.VIP_6]: 'vip/img/VIP_card_big/VIP_6.png',
  [VipLevel.VIP_7]: 'vip/img/VIP_card_big/VIP_7.png',
  [VipLevel.SVIP_1]: 'vip/img/VIP_card_big/SVIP_1.png',
  [VipLevel.SVIP_2]: 'vip/img/VIP_card_big/SVIP_2.png',
  [VipLevel.SVIP_3]: 'vip/img/VIP_card_big/SVIP_3.png',
};

/** VIP 卡影格名稱（未定義的等級用 VIP_0，同原版） */
export function vipCardFrame(vipLevel: number): string {
  return CARD_IMAGE[vipLevel] ?? CARD_IMAGE[VipLevel.VIP_0];
}
