/** 邮路（PostalRoute）数据模型：把一封邮件实际经过的节点串成时间轴。 */

/** 运输方式 */
export type TransportMode = '步班' | '船运' | '铁路' | '航空'

/** 邮路节点：局所名 + 到达日期 + 中转戳 */
export interface RouteNode {
  /** 节点本地唯一键，供拖拽排序使用 */
  key: string
  office: string
  /** 到达日期 YYYY-MM-DD，可为空（空值触发缺日警示） */
  arriveDate: string
  /** 中转戳描述 */
  transitMark: string
}

/** 时间轴节点：邮路节点 / 寄出 / 到达的统一呈现结构 */
export interface TimelineNode {
  key: string
  label: string
  office: string
  date: string
  mark: string
  kind: 'sent' | 'transit' | 'arrive'
}

/**
 * 邮路快照：实寄封挂入邮路那一刻的邮路号、名称与节点。
 * 邮路日后再改不影响已挂封的寄递事实，只有主动同步才会替换。
 */
export interface RouteSnapshot {
  routeId: number
  routeNo: string
  name: string
  nodes: RouteNode[]
}

export interface PostalRoute {
  id?: number
  /** 邮路号，如 RT-0001 */
  routeNo: string
  name: string
  /** 时期，如「清末」「民国」「1950-1959」 */
  era: string
  transport: TransportMode
  nodes: RouteNode[]
  /** 全程天数（由节点日期自动计算） */
  totalDays: number
  /** 班期，如「逐日班」「隔日班」 */
  frequency: string
  remark: string
  createdAt: string
  updatedAt: string
}

export const TRANSPORT_MODES: TransportMode[] = ['步班', '船运', '铁路', '航空']

/** 生成一条空白邮路记录，供表单初始化使用。 */
export function createEmptyRoute(): PostalRoute {
  return {
    routeNo: '',
    name: '',
    era: '',
    transport: '铁路',
    nodes: [],
    totalDays: 0,
    frequency: '',
    remark: '',
    createdAt: '',
    updatedAt: ''
  }
}

/** 由当前邮路生成一份快照，挂封 / 同步时调用。 */
export function createRouteSnapshot(route: PostalRoute): RouteSnapshot {
  return {
    routeId: typeof route.id === 'number' ? route.id : 0,
    routeNo: route.routeNo,
    name: route.name,
    nodes: route.nodes.map((n) => ({ ...n }))
  }
}

/** 邮路现状与封上快照是否已不一致（邮路号 / 名称 / 节点任一变动即为待同步）。 */
export function isSnapshotStale(snapshot: RouteSnapshot, route: PostalRoute): boolean {
  if (snapshot.routeNo !== route.routeNo || snapshot.name !== route.name) return true
  if (snapshot.nodes.length !== route.nodes.length) return true
  return snapshot.nodes.some((node, index) => {
    const current = route.nodes[index]
    return (
      !current ||
      node.office !== current.office ||
      node.arriveDate !== current.arriveDate ||
      node.transitMark !== current.transitMark
    )
  })
}
