import type { ModVersionRow } from '../../../electron/types'
import { useUiStore } from '../../stores/ui-store'

interface ModDependenciesProps {
  versions: ModVersionRow[]
}

interface Dep {
  name: string
  version?: string
}

function parseDeps(json: string | null): Dep[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json)
    if (Array.isArray(parsed)) {
      return parsed.map((d: { name?: string; version?: string } | string) => {
        if (typeof d === 'string') return { name: d }
        return { name: d.name ?? '', version: d.version }
      }).filter((d) => d.name)
    }
    return []
  } catch {
    return []
  }
}

interface DepSectionProps {
  title: string
  deps: Dep[]
  colorClass: string
  dotClass: string
  onClickDep: (name: string) => void
}

function DepSection({ title, deps, colorClass, dotClass, onClickDep }: DepSectionProps) {
  if (deps.length === 0) return null

  return (
    <div className="mb-5">
      <h4 className={`text-xs font-semibold uppercase tracking-wider mb-2 ${colorClass}`}>
        {title}
      </h4>
      <div className="flex flex-col gap-1">
        {deps.map((dep, i) => (
          <button
            key={`${dep.name}-${i}`}
            onClick={() => onClickDep(dep.name)}
            className="
              flex items-center gap-2 text-left px-3 py-1.5 rounded-lg
              bg-[rgba(255,255,255,0.03)] border border-[rgba(99,102,241,0.08)]
              hover:border-[rgba(99,102,241,0.25)] hover:bg-[rgba(255,255,255,0.05)]
              transition-all duration-150 cursor-pointer group
            "
          >
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotClass}`} />
            <span className="text-sm text-white group-hover:text-[rgba(196,181,253,1)] transition-colors">
              {dep.name}
            </span>
            {dep.version && (
              <span className="ml-auto text-xs text-[rgba(100,116,139,0.8)] flex-shrink-0">
                {dep.version}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

export function ModDependencies({ versions }: ModDependenciesProps) {
  const { openModDetail } = useUiStore()

  // Use the latest version's dependency data
  const latest = versions[0]

  if (!latest) {
    return (
      <p className="text-[rgba(148,163,184,0.6)] text-sm">
        No version information available.
      </p>
    )
  }

  const depends = parseDeps(latest.depends)
  const recommends = parseDeps(latest.recommends)
  const suggests = parseDeps(latest.suggests)
  const conflicts = parseDeps(latest.conflicts)

  const hasAny = depends.length + recommends.length + suggests.length + conflicts.length > 0

  if (!hasAny) {
    return (
      <p className="text-[rgba(148,163,184,0.6)] text-sm">
        This mod has no dependencies.
      </p>
    )
  }

  return (
    <div>
      <DepSection
        title="Required"
        deps={depends}
        colorClass="text-white"
        dotClass="bg-white"
        onClickDep={openModDetail}
      />
      <DepSection
        title="Recommended"
        deps={recommends}
        colorClass="text-green-400"
        dotClass="bg-green-400"
        onClickDep={openModDetail}
      />
      <DepSection
        title="Suggested"
        deps={suggests}
        colorClass="text-[rgba(148,163,184,0.8)]"
        dotClass="bg-[rgba(148,163,184,0.6)]"
        onClickDep={openModDetail}
      />
      <DepSection
        title="Conflicts"
        deps={conflicts}
        colorClass="text-red-400"
        dotClass="bg-red-400"
        onClickDep={openModDetail}
      />
    </div>
  )
}
