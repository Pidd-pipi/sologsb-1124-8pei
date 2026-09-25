/** 实寄封（Cover）数据模型：一封实际寄递过的信封的全部编目事实。 */

import type { RouteSnapshot } from './route'

/** 品相 */
export type ConditionGrade = '上品' | '中品' | '下品'

/** 贴票构成：票种 + 面值 + 枚数 */
export interface FrankingItem {
  stampName: string
  denomination: number
  count: number
}

export interface Cover {
  id?: number
  /** 封号，如 CV-0001 */
  coverNo: string
  sentFrom: string
  sentTo: string
  /** 寄出日期 YYYY-MM-DD */
  postDate: string
  /** 到达日期 YYYY-MM-DD */
  arriveDate: string
  franking: FrankingItem[]
  /** 关联邮戳 id 列表 */
  cancelPmIds: number[]
  /** 所属邮路 id（摘除后为 null；快照仍保留） */
  routeId: number | null
  /**
   * 挂入邮路时冻结的邮路快照（邮路号 / 名称 / 节点 / 挂入与同步时间）。
   * 邮路日后修改不影响旧封；摘除邮路后仍保留，重新挂入才覆盖。
   */
  routeSnapshot: RouteSnapshot | null
  /** 中转地数组 */
  viaPoints: string[]
  /** 是否给据邮件 */
  registered: boolean
  conditionGrade: ConditionGrade
  /** 来源 */
  acquireFrom: string
  /** 购入价（元） */
  price: number
  /** 藏册页位 */
  storageAlbum: string
  /** 封面正面图（缩略 dataURL；原图存 assets 表） */
  frontImage: string
  /** 封面背面图（缩略 dataURL；原图存 assets 表） */
  backImage: string
  note: string
  createdAt: string
  updatedAt: string
}

export const CONDITION_GRADES: ConditionGrade[] = ['上品', '中品', '下品']

/**
 * 封上的邮路展示文本：优先当前关联邮路（findRoute 查询当前数据），
 * 摘除后退回保留的历史快照；都没有才是未挂邮路。
 */
export function coverRouteLabel(
  cover: Pick<Cover, 'routeId' | 'routeSnapshot'> | null,
  findRoute?: (id: number) => { routeNo: string; name: string } | null | undefined
): string {
  if (!cover) return '未挂邮路'
  if (typeof cover.routeId === 'number') {
    const rt = findRoute?.(cover.routeId)
    if (rt) return `${rt.routeNo} ${rt.name}`.trim()
    return `邮路 #${cover.routeId}`
  }
  if (cover.routeSnapshot) {
    return `${cover.routeSnapshot.routeNo} ${cover.routeSnapshot.name}`.trim()
  }
  return '未挂邮路'
}

/** 邮路是否已摘除（关联已解除，但历史快照仍保留）。 */
export function isRouteDetached(cover: Pick<Cover, 'routeId' | 'routeSnapshot'> | null): boolean {
  return !!cover && cover.routeId == null && !!cover.routeSnapshot
}

/** 生成一条空白实寄封记录，供表单初始化使用。 */
export function createEmptyCover(): Cover {
  return {
    coverNo: '',
    sentFrom: '',
    sentTo: '',
    postDate: '',
    arriveDate: '',
    franking: [],
    cancelPmIds: [],
    routeId: null,
    routeSnapshot: null,
    viaPoints: [],
    registered: false,
    conditionGrade: '中品',
    acquireFrom: '',
    price: 0,
    storageAlbum: '',
    frontImage: '',
    backImage: '',
    note: '',
    createdAt: '',
    updatedAt: ''
  }
}
