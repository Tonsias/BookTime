import { beforeEach, describe, expect, it, vi } from 'vitest'
import { filesToBook } from '../storage/format'
import type { WorkingCopy } from './store'
import { commitLocal, load, openPull, push } from './sync'

vi.mock('./store', () => {
  const data = new Map<string, WorkingCopy>()
  return {
    copies: {
      get: async (repo: string) => data.get(repo),
      put: async (copy: WorkingCopy) => void data.set(copy.repo, structuredClone(copy)),
    },
    imageCache: { get: async (_repo: string, sha: string) => (sha === 'fehlt' ? undefined : new Blob([`bild ${sha}`])) },
  }
})

/** Nachgebaute GitHub-API mit Commits, Bäumen, Branches und Pull Requests im Speicher */
class FakeGitHub {
  trees = new Map<string, Record<string, string>>()
  commits = new Map<string, { tree: string; parents: string[] }>()
  refs = new Map<string, string>()
  pulls: { number: number; head: string; html_url: string; state: string; merged_at: string | null; sha: string }[] = []
  next = 0

  id = (prefix: string) => `${prefix}${++this.next}`
  files = (commit: string) => this.trees.get(this.commits.get(commit)!.tree)!
  addCommit(files: Record<string, string>, parents: string[]) {
    const tree = this.id('tree')
    this.trees.set(tree, files)
    const sha = this.id('commit')
    this.commits.set(sha, { tree, parents })
    return sha
  }
  // Unterordner als eigene Bäume: Commit oder Unterbaum plus Präfix
  subtrees = new Map<string, { of: string; prefix: string }>()
  view(id: string) {
    const sub = this.subtrees.get(id)
    return { files: this.files(sub?.of ?? id), prefix: sub?.prefix ?? '' }
  }
  blobs(id: string) {
    const { files, prefix } = this.view(id)
    return Object.entries(files)
      .filter(([p]) => p.startsWith(prefix))
      .map(([p, text]) => ({ path: p.slice(prefix.length), type: 'blob', sha: `blob-${p}`, size: text.length }))
  }
  entries(id: string) {
    const { prefix } = this.view(id)
    const names = new Set(this.blobs(id).map((b) => b.path.split('/')[0]! + (b.path.includes('/') ? '/' : '')))
    return [...names].map((name) => {
      if (!name.endsWith('/')) return { path: name, type: 'blob', sha: `blob-${prefix}${name}`, size: 0 }
      const sha = this.id('sub')
      this.subtrees.set(sha, { of: this.subtrees.get(id)?.of ?? id, prefix: prefix + name })
      return { path: name.slice(0, -1), type: 'tree', sha, size: 0 }
    })
  }
  ancestors(sha: string): string[] {
    return [sha, ...(this.commits.get(sha)?.parents ?? []).flatMap((p) => this.ancestors(p))]
  }
  merge(number: number) {
    const pull = this.pulls.find((p) => p.number === number)!
    const main = this.refs.get('main')!
    this.refs.set('main', this.addCommit(this.files(this.refs.get(pull.head)!), [main, this.refs.get(pull.head)!]))
    Object.assign(pull, { state: 'closed', merged_at: 'jetzt' })
  }

  handle(method: string, path: string, body: Record<string, unknown>): [number, unknown] {
    const route = path.replace('/repos/o/buch', '')
    const ref = /^\/git\/refs?\/heads\/(.+)$/.exec(route)?.[1]
    if (route === '/user') return [200, { login: 'tester' }]
    if (route === '') return [200, { default_branch: 'main', size: 12, permissions: { push: true } }]
    if (ref && method === 'GET') return this.refs.has(ref) ? [200, { object: { sha: this.refs.get(ref) } }] : [this.refs.size ? 404 : 409, { message: 'fehlt' }]
    if (ref && method === 'DELETE') return [204, void this.refs.delete(ref)]
    if (ref && method === 'PATCH') {
      const fastForward = this.ancestors(body.sha as string).includes(this.refs.get(ref)!)
      if (!fastForward && !body.force) return [422, { message: 'kein Vorlauf' }]
      this.refs.set(ref, body.sha as string)
      return [200, {}]
    }
    if (route === '/git/refs') {
      this.refs.set((body.ref as string).replace('refs/heads/', ''), body.sha as string)
      return [201, {}]
    }
    const [, tree, recursive] = /^\/git\/trees\/(\w+)(\?recursive=1)?$/.exec(route) ?? []
    if (tree) return [200, { tree: recursive ? this.blobs(tree) : this.entries(tree) }]
    const commit = /^\/git\/commits\/(\w+)$/.exec(route)?.[1]
    if (commit) return [200, { tree: { sha: this.commits.get(commit)!.tree } }]
    if (route === '/git/trees') {
      const files = { ...this.trees.get(body.base_tree as string) }
      for (const entry of body.tree as { path: string; content?: string; sha?: string | null }[]) {
        if (entry.sha) files[entry.path] = `blob:${entry.sha}`
        else if (entry.content === undefined) delete files[entry.path]
        else files[entry.path] = entry.content
      }
      const sha = this.id('tree')
      this.trees.set(sha, files)
      return [201, { sha }]
    }
    if (route === '/git/blobs') return [201, { sha: `hochgeladen-${atob(body.content as string)}` }]
    if (route === '/git/commits') {
      const sha = this.id('commit')
      this.commits.set(sha, { tree: body.tree as string, parents: body.parents as string[] })
      return [201, { sha }]
    }
    const content = /^\/contents\/(.+)$/.exec(route)?.[1]
    if (content) {
      this.refs.set('main', this.addCommit({ [content]: atob(body.content as string) }, []))
      return [201, {}]
    }
    if (route.startsWith('/pulls?')) {
      const head = decodeURIComponent(/head=o:([^&]+)/.exec(route)![1]!)
      return [200, this.pulls.filter((p) => p.head === head).reverse().map((p) => ({ ...p, head: { sha: p.sha } }))]
    }
    if (route === '/pulls') {
      const number = this.pulls.length + 1
      const html_url = `https://github.com/o/buch/pull/${number}`
      this.pulls.push({ number, head: body.head as string, html_url, state: 'open', merged_at: null, sha: this.refs.get(body.head as string)! })
      return [201, { html_url }]
    }
    if (route === '/graphql') {
      const repository: Record<string, { text: string }> = {}
      for (const [, name, commitSha, file] of (body.query as string).matchAll(/(f\d+): object\(expression: "(\w+):([^"]+)"\)/g))
        repository[name!] = { text: this.files(commitSha!)[file!]! }
      return [200, { data: { repository } }]
    }
    throw new Error(`Unbekannter Aufruf ${method} ${path}`)
  }
}

let github: FakeGitHub

beforeEach(() => {
  github = new FakeGitHub()
  vi.stubGlobal('fetch', async (url: string, init: { method: string; body?: string }) => {
    const [status, body] = github.handle(init.method, url.replace('https://api.github.com', ''), init.body ? JSON.parse(init.body) : {})
    return new Response(status === 204 || body === undefined ? null : JSON.stringify(body), { status })
  })
})

describe('GitHub-Abläufe', () => {
  it('richtet ein leeres Repo mit einem ersten Zeitpunkt ein', async () => {
    const copy = await load('token', 'o/buch')
    expect(copy.branch).toBe('tester/arbeit')
    expect(github.refs.get('tester/arbeit')).toBe(github.refs.get('main'))
    expect(Object.keys(copy.base).sort()).toEqual(['booktime.json', expect.stringMatching(/^time-points\/anfang-\w{4}\.json$/)])
    expect(filesToBook(copy.base).book.timePoints.map((t) => t.name)).toEqual(['Anfang'])
  })

  it('pusht lokale Commits einzeln auf den Arbeitsbranch', async () => {
    let copy = await load('token', 'o/buch')
    copy = await commitLocal({ ...copy, files: { ...copy.files, 'booktime.note.md': 'Eins\n' } }, 'Erster')
    copy = await commitLocal({ ...copy, files: { ...copy.files, 'booktime.note.md': 'Zwei\n' } }, 'Zweiter')
    copy = await push('token', copy)
    expect(copy.commits).toEqual([])
    expect(github.refs.get('tester/arbeit')).toBe(copy.head)
    expect(github.files(copy.head)['booktime.note.md']).toBe('Zwei\n')
    expect(github.ancestors(copy.head)).toHaveLength(4)
  })

  it('weicht auf einen neuen Branch aus, wenn der Arbeitsbranch auf GitHub weiter ist', async () => {
    let copy = await load('token', 'o/buch')
    const elsewhere = github.addCommit({ ...github.files(copy.head), 'booktime.note.md': 'Von woanders\n' }, [copy.head])
    github.refs.set('tester/arbeit', elsewhere)
    copy = await push('token', await commitLocal({ ...copy, files: { ...copy.files, 'booktime.note.md': 'Lokal\n' } }, 'Lokal'))
    expect(copy.branch).toBe('tester/arbeit-2')
    expect(github.refs.get('tester/arbeit')).toBe(elsewhere)
  })

  it('setzt den Arbeitsbranch nach dem Merge auf den Standardbranch', async () => {
    let copy = await load('token', 'o/buch')
    copy = await push('token', await commitLocal({ ...copy, files: { ...copy.files, 'booktime.note.md': 'Neu\n' } }, 'Notiz'))
    copy = await openPull('token', copy)
    expect(copy.pullUrl).toBe('https://github.com/o/buch/pull/1')
    github.merge(1)
    copy = await load('token', 'o/buch')
    expect(copy.head).toBe(github.refs.get('main'))
    expect(copy.pullUrl).toBeUndefined()
    expect(copy.base['booktime.note.md']).toBe('Neu\n')
  })

  it('kehrt nach dem Merge eines Ausweichbranches zum Arbeitsbranch zurück', async () => {
    let copy = await load('token', 'o/buch')
    github.refs.set(copy.branch, github.addCommit(github.files(copy.head), [copy.head]))
    copy = await push('token', await commitLocal({ ...copy, files: { ...copy.files, 'booktime.note.md': 'Lokal\n' } }, 'Lokal'))
    expect(copy.branch).toMatch(/-\d+$/)
    const fallback = copy.branch
    copy = await openPull('token', copy)
    github.merge(1)
    copy = await load('token', 'o/buch')
    expect(copy.branch).toBe('tester/arbeit')
    expect(github.refs.has(fallback)).toBe(false)
    expect(github.refs.get('tester/arbeit')).toBe(github.refs.get('main'))
  })

  it('lädt neue Bilder als Blobs hoch und löscht entfernte', async () => {
    let copy = await load('token', 'o/buch')
    copy = await commitLocal({ ...copy, imageChanges: { 'images/karte-kkkk.png': { sha: 'k1', size: 5 } } }, 'Karte')
    expect(copy.imageChanges).toEqual({})
    copy = await push('token', copy)
    expect(github.files(copy.head)['images/karte-kkkk.png']).toBe('blob:hochgeladen-bild k1')
    expect(copy.images['images/karte-kkkk.png']).toEqual({ sha: 'k1', size: 5 })
    copy = await push('token', await commitLocal({ ...copy, imageChanges: { 'images/karte-kkkk.png': null } }, 'Weg'))
    expect(github.files(copy.head)['images/karte-kkkk.png']).toBeUndefined()
  })

  it('meldet ein Bild, das im Browser-Speicher fehlt', async () => {
    const copy = await commitLocal({ ...(await load('token', 'o/buch')), imageChanges: { 'images/x-xxxx.png': { sha: 'fehlt', size: 1 } } }, 'Bild')
    await expect(push('token', copy)).rejects.toThrow('fehlt im Browser-Speicher')
  })

  describe('Buch in einem Unterordner', () => {
    const code = { 'README.md': '# Projekt\n', 'src/app.json': '{}\n' }
    beforeEach(() => void github.refs.set('main', github.addCommit(code, [])))

    it('richtet einen leeren Ordner auf dem Standardbranch ein und lädt nur das Buch', async () => {
      const copy = await load('token', 'o/buch/docs/story')
      expect(Object.keys(copy.base).sort()).toEqual(['booktime.json', expect.stringMatching(/^time-points\/anfang-\w{4}\.json$/)])
      expect(filesToBook(copy.base).book.title).toBe('story')
      expect(github.files(github.refs.get('main')!)).toMatchObject(code)
      expect(Object.keys(github.files(github.refs.get('main')!)).filter((p) => !(p in code)).every((p) => p.startsWith('docs/story/'))).toBe(true)
    })

    it('ändert beim Push nur Dateien unterhalb des Ordners', async () => {
      let copy = await load('token', 'o/buch/story')
      copy = await push('token', await commitLocal({ ...copy, files: { ...copy.files, 'booktime.note.md': 'Neu\n' } }, 'Notiz'))
      const files = github.files(copy.head)
      expect(files['story/booktime.note.md']).toBe('Neu\n')
      expect(files['booktime.note.md']).toBeUndefined()
      expect(files).toMatchObject(code)
    })

    it('lehnt einen Ordner mit fremden Dateien ohne booktime.json ab', async () => {
      await expect(load('token', 'o/buch/src')).rejects.toThrow('Im Ordner src liegt kein Buch')
    })
  })

  it('schließt einen abgebrochenen Push nur noch ab', async () => {
    let copy = await load('token', 'o/buch')
    copy = await commitLocal({ ...copy, files: { ...copy.files, 'booktime.note.md': 'Fast fertig\n' } }, 'Abgebrochen')
    const pushed = github.addCommit({ ...github.files(copy.head), 'booktime.note.md': 'Fast fertig\n' }, [copy.head])
    github.refs.set(copy.branch, pushed)
    const before = github.commits.size
    copy = await push('token', { ...copy, pushing: { branch: copy.branch, head: pushed } })
    expect(copy).toMatchObject({ head: pushed, commits: [], pushing: undefined })
    expect(github.commits.size).toBe(before)
  })
})
