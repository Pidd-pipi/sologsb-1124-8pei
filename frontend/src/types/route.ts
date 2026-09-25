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

/**
 * 邮路快照：实寄封挂入邮路时，把当时的邮路号、名称与节点冻结在封上。
 * 此后邮路再改，旧封仍按快照展示，只有主动「同步当前邮路」才更新。
 */
export interface RouteSnapshot {
  routeId: number
  routeNo: string
  name: string
  nodes: RouteNode[]
  /** 挂入邮路（首次冻结）时间 ISO */
  attachedAt: string
  /** 最近一次「同步当前邮路」时间 ISO，从未同步为空串 */
  syncedAt: string
}

/** 由当前邮路冻结出一份快照。 */
export function snapshotRoute(route: PostalRoute, attachedAt: string, syncedAt = ''): RouteSnapshot {
  return {
    routeId: route.id as number,
    routeNo: route.routeNo,
    name: route.name,
    nodes: route.nodes.map((n) => ({ ...n })),
    attachedAt,
    syncedAt
  }
}

/** 把快照还原成可用于拼时间轴的邮路结构。 */
export function routeFromSnapshot(snapshot: RouteSnapshot): PostalRoute {
  return {
    id: snapshot.routeId,
    routeNo: snapshot.routeNo,
    name: snapshot.name,
    era: '',
    transport: '铁路',
    nodes: snapshot.nodes.map((n) => ({ ...n })),
    totalDays: 0,
    frequency: '',
    remark: '',
    createdAt: '',
    updatedAt: ''
  }
}

/** 邮路可影响时间轴的字段签名；快照与当前邮路签名不同即需要同步。 */
export function routeSignature(route: Pick<PostalRoute, 'routeNo' | 'name' | 'nodes'>): string {
  const nodes = route.nodes.map((n) => `${n.office}|${n.arriveDate}|${n.transitMark}`)
  return JSON.stringify([route.routeNo, route.name, nodes])
}

/** 邮路 / 快照统一的「邮路号 名称」展示文本。 */
export function routeLabelOf(route: Pick<PostalRoute, 'routeNo' | 'name'>): string {
  return `${route.routeNo} ${route.name}`.trim()
}

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
