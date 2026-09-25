/**
 * 由实寄封与邮路节点拼出寄递时间轴，并计算在途天数。
 * 被封详情页与邮路编辑器复用。
 */
import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'
import { db } from '@/utils/db'
import type { Cover } from '@/types/cover'
import type { PostalRoute, RouteSnapshot, TimelineNode } from '@/types/route'
import { isSnapshotStale } from '@/types/route'
import { daysBetween, isValidDate } from '@/utils/dateRange'

/** 时间轴只需要邮路的节点，快照与现邮路都可作为来源。 */
type TimelineRoute = PostalRoute | RouteSnapshot | null

/** 由封与邮路（或挂入时的快照）拼时间轴：寄出 → 中转（节点 / 中转地） → 到达。 */
export function buildTimeline(cover: Cover | null, route: TimelineRoute): TimelineNode[] {
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

export function useCoverRoute(coverId: Ref<number | null> | ComputedRef<number | null>) {
  const cover = ref<Cover | null>(null)
  const route = ref<PostalRoute | null>(null)
  const loading = ref(false)
  const error = ref('')

  async function load(): Promise<void> {
    const id = coverId.value
    if (id == null || Number.isNaN(id)) {
      cover.value = null
      route.value = null
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
        route.value = rt ?? null
      } else {
        route.value = null
      }
    } finally {
      loading.value = false
    }
  }

  watch(coverId, () => void load(), { immediate: true })

  /** 挂入邮路时留存的快照；时间轴始终按它呈现，不随后续邮路编辑变动。 */
  const snapshot = computed<RouteSnapshot | null>(() => cover.value?.routeSnapshot ?? null)

  const timeline = computed<TimelineNode[]>(() =>
    buildTimeline(cover.value, cover.value?.routeSnapshot ?? null)
  )

  /** 快照与当前邮路是否已不一致（仅未摘除且邮路仍在时才可能为真） */
  const snapshotStale = computed<boolean>(() => {
    const snap = cover.value?.routeSnapshot
    return !!snap && !!route.value && isSnapshotStale(snap, route.value)
  })

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
    snapshot,
    timeline,
    transitDays,
    missingDateNodes,
    chronological,
    snapshotStale,
    loading,
    error,
    load
  }
}
