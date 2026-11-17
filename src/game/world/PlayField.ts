/**
 * 場內範圍：子彈牆（反彈 / 每秒清除牆外子彈）+ 自動選目標範圍（原版 FishBase:GetIsInScreen）。
 *
 * 原版是固定常數 WALL_POLYGON，配合固定相機（牆 = 畫面底邊兩角 ~ 畫面 78% 高度投到地面）。
 * 相機可切換後（debug 相機預設）牆要跟著換：否則砲台落在牆外、牆縮在畫面中間，子彈一出砲口就被彈回來。
 */
import type { Vec2 } from '@core/math/cocos';
import { WALL_POLYGON } from '../define/DisplayDefine';

export class PlayField {
  wall: readonly Vec2[] = WALL_POLYGON;
}
