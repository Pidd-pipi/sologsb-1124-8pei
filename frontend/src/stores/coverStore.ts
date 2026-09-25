import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { db, saveAsset } from '@/utils/db'
import type { Cover, FrankingItem } from '@/types/cover'
import type { RouteSnapshot } from '@/types/route'
import { createRouteSnapshot } from '@/types/route'
import type { StamplessEntry } from '@/types/stampentry'
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

  /** 按当前邮路生成快照；邮路已不存在时返回 null（挂不上快照，不影响挂接本身）。 */
  async function resolveSnapshot(routeId: number | null): Promise<RouteSnapshot | null> {
    if (typeof routeId !== 'number') return null
    const route = await db.routes.get(routeId)
    return route ? createRouteSnapshot(route) : null
  }

  async function create(
    input: Cover,
    images?: Partial<Record<'front' | 'back', ImagePayload>>
  ): Promise<number> {
    const now = nowIso()
    const routeId = typeof input.routeId === 'number' ? input.routeId : null
    const routeSnapshot = await resolveSnapshot(routeId)
    const record: Cover = {
      ...input,
      coverNo: input.coverNo || nextCoverNo(),
      franking: input.franking.map((f) => ({ ...f })),
      cancelPmIds: [...input.cancelPmIds],
      viaPoints: [...input.viaPoints],
      routeId,
      // 登记封时即挂邮路的，快照按当前邮路留存
      routeSnapshot,
      routeSnapshottedAt: routeSnapshot ? now : '',
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
    const next: Partial<Cover> = { ...patch, updatedAt: nowIso() }
    // 只有改挂 / 新挂邮路时才重写快照；摘除邮路（routeId=null）保留旧快照。
    if (Object.prototype.hasOwnProperty.call(patch, 'routeId')) {
      if (typeof patch.routeId === 'number') {
        const snapshot = await resolveSnapshot(patch.routeId)
        next.routeSnapshot = snapshot
        next.routeSnapshottedAt = snapshot ? nowIso() : ''
      } else {
        delete next.routeSnapshot
        delete next.routeSnapshottedAt
      }
    }
    await db.covers.update(id, next)
    await load()
  }

  /** 主动把封上的邮路快照同步为当前邮路，并记下同步时间。 */
  async function syncRouteSnapshot(id: number): Promise<boolean> {
    const cover = await db.covers.get(id)
    if (!cover || typeof cover.routeId !== 'number') return false
    const snapshot = await resolveSnapshot(cover.routeId)
    if (!snapshot) return false
    await db.covers.update(id, {
      routeSnapshot: snapshot,
      routeSnapshottedAt: nowIso(),
      updatedAt: nowIso()
    })
    await load()
    return true
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
    syncRouteSnapshot,
    remove,
    addEntry,
    removeEntry,
    byId,
    entriesOf,
    frankingCount,
    cancelCount
  }
})
