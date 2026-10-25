import { FORMAT, type BookFiles } from '../storage/format'
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

/**
 * Lädt den Arbeitsbranch eines Repos neu in die Arbeitskopie. Legt in einem leeren Repo `booktime.json`
 * an, legt den Arbeitsbranch bei Bedarf an und setzt ihn nach einem gemergten Pull Request auf den Standardbranch.
 */
export async function load(token: string, repo: string): Promise<WorkingCopy> {
  const gh = new GitHub(token, repo)
  const [login, info, previous] = await Promise.all([gh.login(), gh.repository(), copies.get(repo)])
  if (!info.permissions?.push) throw new Error('Das Token hat kein Schreibrecht (Contents: Read and write) für dieses Repo.')
  const branch = previous?.branch ?? `${login}/arbeit`

  let main = await gh.branchSha(info.default_branch)
  if (!main) {
    const title = repo.split('/')[1]
    await gh.createFirstFile('booktime.json', JSON.stringify({ format: FORMAT, title }, null, 2) + '\n', 'BookTime einrichten')
    main = (await gh.branchSha(info.default_branch))!
  }
  let head = await gh.branchSha(branch)
  if (!head) {
    await gh.setBranch(branch, main, 'create')
    head = main
  }
  const [latest] = await gh.pulls(branch)
  if (latest?.merged_at && latest.head.sha === head && head !== main) {
    await gh.setBranch(branch, main, 'force')
    head = main
  }

  const tree = await gh.tree(head)
  const base = await gh.texts(
    head,
    tree.filter((e) => isText(e.path)).map((e) => e.path),
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
  const changes = Object.fromEntries(diff(before, copy.files).map(([path, kind]) => [path, kind === 'gelöscht' ? null : copy.files[path]]))
  const next = { ...copy, commits: [...copy.commits, { message, changes }] }
  await copies.put(next)
  return next
}

/** Überträgt die lokalen Commits; ist der Arbeitsbranch auf GitHub weiter, auf einen neuen Branch */
export async function push(token: string, copy: WorkingCopy) {
  const gh = new GitHub(token, copy.repo)
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
  await gh.setBranch(branch, head, 'update')
  const next: WorkingCopy = { ...copy, branch, head, base: committed(copy), commits: [], pullUrl: branch === copy.branch ? copy.pullUrl : undefined }
  await copies.put(next)
  return next
}

/** Erstellt einen Pull Request vom Arbeitsbranch in den Standardbranch */
export async function openPull(token: string, copy: WorkingCopy) {
  const pullUrl = await new GitHub(token, copy.repo).createPull(copy.branch, copy.defaultBranch, `Änderungen von ${copy.login}`)
  const next = { ...copy, pullUrl }
  await copies.put(next)
  return next
}
