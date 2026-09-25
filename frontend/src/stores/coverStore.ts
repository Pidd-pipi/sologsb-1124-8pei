import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { db, saveAsset } from '@/utils/db'
import type { Cover, FrankingItem } from '@/types/cover'
import type { StamplessEntry } from '@/types/stampentry'
import type { RouteSnapshot } from '@/types/route'
import { snapshotRoute } from '@/types/route'
import { nextSerialNo, nowIso } from '@/utils/id'
import type { ImagePayload } from './postmarkStore'

export const useCoverStore = defineStore('cover', () => {
  const list = ref<Cover[]>([])
  const entries = ref<StamplessEntry[]>([])
  const loading = ref(false)
  const loaded = ref(false)

  async function load(): Promise<void> {
    loading.value = true
    try {
      list.value = await db.covers.orderBy('coverNo').toArray()
      entries.value = await db.stampEntries.toArray()
      loaded.value = true
    } finally {
      loading.value = false
    }
  }

  /** 生成下一个封号，如 CV-0005 */
  function nextCoverNo(): string {
    return nextSerialNo('CV-', list.value.map((c) => c.coverNo))
  }

  async function create(
    input: Cover,
    images?: Partial<Record<'front' | 'back', ImagePayload>>
  ): Promise<number> {
    const now = nowIso()
    const routeId = typeof input.routeId === 'number' ? input.routeId : null
    // 登记时已挂邮路：立刻按当前邮路冻结快照，与「挂入邮路」语义一致。
    let routeSnapshot: RouteSnapshot | null = null
    if (routeId != null) {
      const rt = await db.routes.get(routeId)
      if (rt) routeSnapshot = snapshotRoute(rt, now)
    }
    const record: Cover = {
      ...input,
      coverNo: input.coverNo || nextCoverNo(),
      franking: input.franking.map((f) => ({ ...f })),
      cancelPmIds: [...input.cancelPmIds],
      routeId: routeSnapshot ? routeId : null,
      routeSnapshot,
      viaPoints: [...input.viaPoints],
      createdAt: now,
      updatedAt: now
    }
    delete record.id
    const id = await db.covers.add(record)
    for (const side of ['front', 'back'] as const) {
      const payload = images?.[side]
      if (payload && payload.dataUrl) {
        await saveAsset({
          ownerType: 'cover',
          ownerId: id,
          side,
          dataUrl: payload.dataUrl,
          fileName: payload.fileName,
          updatedAt: now
        })
      }
    }
    await load()
    return id
  }

  async function update(id: number, patch: Partial<Cover>): Promise<void> {
    await db.covers.update(id, { ...patch, updatedAt: nowIso() })
    await load()
  }

  /**
   * 把封挂入邮路：按当前邮路冻结快照（邮路号 / 名称 / 节点 + 挂入时间）。
   * 邮路不存在或与原邮路相同都不做冻结。
   */
  async function attachRoute(coverId: number, routeId: number): Promise<void> {
    const cover = await db.covers.get(coverId)
    if (!cover) throw new Error('实寄封不存在')
    if (cover.routeId === routeId && cover.routeSnapshot?.routeId === routeId) {
      throw new Error('该封已挂在此邮路上')
    }
    const rt = await db.routes.get(routeId)
    if (!rt) throw new Error('邮路不存在')
    await db.covers.update(coverId, {
      routeId,
      routeSnapshot: snapshotRoute(rt, nowIso()),
      updatedAt: nowIso()
    })
    await load()
  }

  /**
   * 主动同步当前邮路：用当前邮路覆盖历史快照，仅替换邮路号 / 名称 / 节点，
   * 并记录同步时间；挂入时间保持首次挂入时不变。摘除邮路后不允许同步。
   */
  async function syncRoute(coverId: number): Promise<void> {
    const cover = await db.covers.get(coverId)
    if (!cover) throw new Error('实寄封不存在')
    if (typeof cover.routeId !== 'number' || !cover.routeSnapshot) {
      throw new Error('该封未挂邮路，无法同步')
    }
    const rt = await db.routes.get(cover.routeId)
    if (!rt) throw new Error('当前邮路已不存在')
    const syncedAt = nowIso()
    await db.covers.update(coverId, {
      routeSnapshot: snapshotRoute(rt, cover.routeSnapshot.attachedAt, syncedAt),
      updatedAt: syncedAt
    })
    await load()
  }

  /** 摘除邮路：解除关联，但保留冻结快照，旧时间轴仍按快照展示。 */
  async function detachRoute(coverId: number): Promise<void> {
    await db.covers.update(coverId, { routeId: null, updatedAt: nowIso() })
    await load()
  }

  async function remove(id: number): Promise<void> {
    await db.covers.delete(id)
    const own = await db.stampEntries.where('coverId').equals(id).toArray()
    await db.stampEntries.bulkDelete(own.map((e) => e.id).filter((v): v is number => typeof v === 'number'))
    await load()
  }

  async function addEntry(input: StamplessEntry): Promise<number> {
    const id = await db.stampEntries.add({ ...input, createdAt: nowIso() })
    await load()
    return id
  }

  async function removeEntry(id: number): Promise<void> {
    await db.stampEntries.delete(id)
    await load()
  }

  function byId(id: number | null | undefined): Cover | null {
    if (id == null) return null
    return list.value.find((c) => c.id === id) ?? null
  }

  /** 某个封下的票戳组合明细 */
  function entriesOf(coverId: number | null | undefined): StamplessEntry[] {
    if (coverId == null) return []
    return entries.value.filter((e) => e.coverId === coverId)
  }

  /** 贴票枚数（行内展示用） */
  function frankingCount(cover: Cover | null): number {
    if (!cover) return 0
    return cover.franking.reduce((sum, f: FrankingItem) => sum + (Number(f.count) || 0), 0)
  }

  /** 关联邮戳数（行内展示用） */
  function cancelCount(cover: Cover | null): number {
    return cover ? cover.cancelPmIds.length : 0
  }

  const coversOfRoute = computed(() => {
    return (routeId: number): Cover[] => list.value.filter((c) => c.routeId === routeId)
  })

  const total = computed(() => list.value.length)
  const registeredCount = computed(() => list.value.filter((c) => c.registered).length)

  return {
    list,
    entries,
    loading,
    loaded,
    total,
    registeredCount,
    coversOfRoute,
    load,
    nextCoverNo,
    create,
    update,
    remove,
    attachRoute,
    syncRoute,
    detachRoute,
    addEntry,
    removeEntry,
    byId,
    entriesOf,
    frankingCount,
    cancelCount
  }
})
