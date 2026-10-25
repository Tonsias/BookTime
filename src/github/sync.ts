import { FORMAT, firstTimePoint, type BookFiles } from '../storage/format'
import { GitHub } from './api'
import { copies, type WorkingCopy } from './store'

const isText = (path: string) => /\.(json|md)$/.test(path)

/** Stand nach allen lokalen Commits */
export function committed(copy: WorkingCopy): BookFiles {
  const files = { ...copy.base }
  for (const { changes } of copy.commits)
    for (const [path, content] of Object.entries(changes)) {
      if (content === null) delete files[path]
      else files[path] = content
    }
  return files
}

/** Art einer Änderung an einer Datei */
export type ChangeKind = 'neu' | 'geändert' | 'gelöscht'

/** Änderungen zwischen zwei Ständen, nach Pfad sortiert */
export function diff(before: BookFiles, after: BookFiles): [string, ChangeKind][] {
  const paths = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()
  return paths.flatMap((path): [string, ChangeKind][] => {
    if (!(path in after)) return [[path, 'gelöscht']]
    if (!(path in before)) return [[path, 'neu']]
    return before[path] === after[path] ? [] : [[path, 'geändert']]
  })
}

/** Lädt den Arbeitsbranch neu; richtet leere Repos ein und setzt den Branch nach einem Merge auf den Standardbranch */
export async function load(token: string, repo: string): Promise<WorkingCopy> {
  const gh = new GitHub(token, repo)
  const [login, info, previous] = await Promise.all([gh.login(), gh.repository(), copies.get(repo)])
  if (!info.permissions?.push) throw new Error('Das Token hat kein Schreibrecht (Contents: Read and write) für dieses Repo.')
  let branch = previous?.branch ?? `${login}/arbeit`

  let main = await gh.branchSha(info.default_branch)
  if (!main) {
    const title = repo.split('/')[1]
    await gh.createFirstFile('booktime.json', JSON.stringify({ format: FORMAT, title }, null, 2) + '\n', 'BookTime einrichten')
    const [path, content] = firstTimePoint({})
    main = await gh.commit((await gh.branchSha(info.default_branch))!, 'Ersten Zeitpunkt anlegen', { [path]: { content } })
    await gh.setBranch(info.default_branch, main, 'update')
  }
  let head = await gh.branchSha(branch)
  if (!head) {
    await gh.setBranch(branch, main, 'create')
    head = main
  }
  const [latest] = await gh.pulls(branch)
  if (latest?.merged_at && latest.head.sha === head && head !== main) {
    // Ein Ausweichbranch (…-2) hat seinen Zweck erfüllt, weiter geht es auf dem Arbeitsbranch selbst
    const stem = branch.replace(/-\d+$/, '')
    if (stem !== branch) await gh.deleteBranch(branch)
    await gh.setBranch(stem, main, (await gh.branchSha(stem)) ? 'force' : 'create')
    branch = stem
    head = main
  }

  const tree = await gh.tree(head)
  const base = await gh.texts(
    head,
    tree.filter((e) => isText(e.path)),
  )
  const copy: WorkingCopy = {
    repo,
    login,
    branch,
    defaultBranch: info.default_branch,
    head,
    base,
    images: Object.fromEntries(tree.filter((e) => !isText(e.path)).map((e) => [e.path, { sha: e.sha, size: e.size }])),
    files: { ...base },
    commits: [],
    repoSize: info.size,
    pullUrl: latest?.state === 'open' ? latest.html_url : undefined,
  }
  await copies.put(copy)
  return copy
}

/** Fasst die offenen Änderungen zu einem lokalen Commit zusammen */
export async function commitLocal(copy: WorkingCopy, message: string) {
  const before = committed(copy)
  const changes = Object.fromEntries(diff(before, copy.files).map(([path, kind]) => [path, kind === 'gelöscht' ? null : (copy.files[path] ?? null)]))
  const next = { ...copy, commits: [...copy.commits, { message, changes }] }
  await copies.put(next)
  return next
}

const finish = async (copy: WorkingCopy, branch: string, head: string) => {
  const next: WorkingCopy = { ...copy, branch, head, base: committed(copy), commits: [], pushing: undefined, pullUrl: branch === copy.branch ? copy.pullUrl : undefined }
  await copies.put(next)
  return next
}

/** Überträgt die lokalen Commits (bei Vorlauf auf GitHub auf einen neuen Branch), schließt abgebrochene Pushes ab */
export async function push(token: string, copy: WorkingCopy) {
  const gh = new GitHub(token, copy.repo)
  if (copy.pushing && (await gh.branchSha(copy.pushing.branch)) === copy.pushing.head) return finish(copy, copy.pushing.branch, copy.pushing.head)
  let branch = copy.branch
  const remote = await gh.branchSha(branch)
  if (remote !== copy.head) {
    const stem = branch.replace(/-\d+$/, '')
    for (let n = 2; ; n++) {
      branch = `${stem}-${n}`
      if (!(await gh.branchSha(branch))) break
    }
    await gh.setBranch(branch, copy.head, 'create')
  }
  let head = copy.head
  for (const { message, changes } of copy.commits) {
    const entries = Object.fromEntries(Object.entries(changes).map(([path, content]) => [path, content === null ? null : { content }]))
    head = await gh.commit(head, message, entries)
  }
  await copies.put({ ...copy, pushing: { branch, head } })
  await gh.setBranch(branch, head, 'update')
  return finish(copy, branch, head)
}

/** Erstellt einen Pull Request vom Arbeitsbranch in den Standardbranch */
export async function openPull(token: string, copy: WorkingCopy) {
  const pullUrl = await new GitHub(token, copy.repo).createPull(copy.branch, copy.defaultBranch, `Änderungen von ${copy.login}`)
  const next = { ...copy, pullUrl }
  await copies.put(next)
  return next
}
