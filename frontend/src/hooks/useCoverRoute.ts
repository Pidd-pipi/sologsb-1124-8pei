/**
 * 由实寄封与邮路节点拼出寄递时间轴，并计算在途天数。
 * 被封详情页与邮路编辑器复用。
 *
 * 时间轴默认按封上冻结的「邮路快照」展示：挂入邮路时是什么样，以后就一直
 * 按什么样展示，邮路后来再改也不会覆盖历史。只有在邮路编辑器（live 模式）
 * 预览时才直接读当前邮路。
 */
import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'
import { db } from '@/utils/db'
import type { Cover } from '@/types/cover'
import {
  routeFromSnapshot,
  routeSignature,
  type PostalRoute,
  type TimelineNode
} from '@/types/route'
import { daysBetween, isValidDate } from '@/utils/dateRange'

/** 由封与邮路拼时间轴：寄出 → 中转（邮路节点 / 中转地） → 到达。 */
export function buildTimeline(cover: Cover | null, route: PostalRoute | null): TimelineNode[] {
  if (!cover) return []
  const nodes: TimelineNode[] = [
    {
      key: 'sent',
      label: '寄出',
      office: cover.sentFrom || '寄出地待考',
      date: cover.postDate,
      mark: '收寄日戳',
      kind: 'sent'
    }
  ]

  const transit: TimelineNode[] = []
  if (route && route.nodes.length) {
    for (const node of route.nodes) {
      const isFirst = node.office === cover.sentFrom
      const isLast = node.office === cover.sentTo
      if (isFirst) continue
      transit.push({
        key: node.key,
        label: isLast ? '到达' : '中转',
        office: node.office || '节点待补',
        date: node.arriveDate,
        mark: node.transitMark || '中转戳待补',
        kind: isLast ? 'arrive' : 'transit'
      })
    }
  } else {
    cover.viaPoints.forEach((point, index) => {
      transit.push({
        key: `via-${index}`,
        label: '中转',
        office: point,
        date: '',
        mark: '中转戳待考',
        kind: 'transit'
      })
    })
  }

  const hasArrive = transit.some((n) => n.kind === 'arrive')
  nodes.push(...transit)
  if (!hasArrive) {
    nodes.push({
      key: 'arrive',
      label: '到达',
      office: cover.sentTo || '收件地待考',
      date: cover.arriveDate,
      mark: '到达戳',
      kind: 'arrive'
    })
  } else {
    const last = nodes[nodes.length - 1]
    if (!last.date && cover.arriveDate) last.date = cover.arriveDate
  }
  return nodes
}

export interface UseCoverRouteOptions {
  /**
   * snapshot（默认）：时间轴按挂入时冻结的快照展示，邮路后来修改不影响旧封；
   * live：始终按当前邮路展示（邮路编辑器内的实时预览用）。
   */
  mode?: 'snapshot' | 'live'
}

export function useCoverRoute(
  coverId: Ref<number | null> | ComputedRef<number | null>,
  options: UseCoverRouteOptions = {}
) {
  const mode = options.mode ?? 'snapshot'
  const cover = ref<Cover | null>(null)
  /** 当前邮路（可能已与快照不一致） */
  const liveRoute = ref<PostalRoute | null>(null)
  const loading = ref(false)
  const error = ref('')

  async function load(): Promise<void> {
    const id = coverId.value
    if (id == null || Number.isNaN(id)) {
      cover.value = null
      liveRoute.value = null
      error.value = id == null ? '' : '封号无效'
      return
    }
    loading.value = true
    try {
      const found = await db.covers.get(id)
      cover.value = found ?? null
      error.value = found ? '' : `未找到编号为 ${id} 的实寄封`
      if (found && typeof found.routeId === 'number') {
        const rt = await db.routes.get(found.routeId)
        liveRoute.value = rt ?? null
      } else {
        liveRoute.value = null
      }
    } finally {
      loading.value = false
    }
  }

  watch(coverId, () => void load(), { immediate: true })

  /** 挂入时冻结的快照；摘除邮路后仍在。 */
  const snapshot = computed(() => cover.value?.routeSnapshot ?? null)

  /**
   * 时间轴使用的邮路：
   * - snapshot 模式优先封上快照（含摘除后保留的快照），无快照时退回当前邮路；
   * - live 模式始终用当前邮路，没有则用快照兜底。
   */
  const route = computed<PostalRoute | null>(() => {
    if (mode === 'live') {
      return (
        liveRoute.value ??
        (snapshot.value ? routeFromSnapshot(snapshot.value) : null)
      )
    }
    if (snapshot.value) return routeFromSnapshot(snapshot.value)
    return liveRoute.value
  })

  /** 当前仍关联着邮路（邮路实体存在）。 */
  const hasCurrentRoute = computed(
    () => cover.value?.routeId != null && liveRoute.value != null
  )

  /** 邮路已被摘除，但封上还留着历史快照。 */
  const detached = computed(
    () => cover.value?.routeId == null && snapshot.value != null
  )

  /** 快照与当前邮路不一致（邮路号 / 名称 / 节点后来改过），可主动同步。 */
  const routeChanged = computed(() => {
    if (!hasCurrentRoute.value || !snapshot.value || !liveRoute.value) return false
    return routeSignature(snapshot.value) !== routeSignature(liveRoute.value)
  })

  const timeline = computed<TimelineNode[]>(() => buildTimeline(cover.value, route.value))

  /** 在途天数：寄出日期 → 到达日期 */
  const transitDays = computed<number | null>(() => {
    if (!cover.value) return null
    return daysBetween(cover.value.postDate, cover.value.arriveDate)
  })

  /** 缺少日期的节点，供缺日警示使用 */
  const missingDateNodes = computed<TimelineNode[]>(() =>
    timeline.value.filter((n) => !isValidDate(n.date))
  )

  /** 节点日期是否单调不减 */
  const chronological = computed<boolean>(() => {
    const dated = timeline.value.filter((n) => isValidDate(n.date))
    for (let i = 1; i < dated.length; i += 1) {
      if (dated[i - 1].date > dated[i].date) return false
    }
    return true
  })

  return {
    cover,
    route,
    liveRoute,
    snapshot,
    hasCurrentRoute,
    detached,
    routeChanged,
    timeline,
    transitDays,
    missingDateNodes,
    chronological,
    loading,
    error,
    load
  }
}
