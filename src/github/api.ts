const API = 'https://api.github.com'

/** Fehlerantwort der GitHub-API */
class GitHubError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** Zugang zu einem Repo über die GitHub-API */
export class GitHub {
  token: string
  repo: string

  constructor(token: string, repo: string) {
    this.token = token
    this.repo = repo
  }

  async request<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    const response = await fetch(`${API}${path.replace('{repo}', `repos/${this.repo}`)}`, {
      method: init.method ?? 'GET',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    })
    if (!response.ok) {
      const { message } = await response.json().catch(() => ({ message: response.statusText }))
      throw new GitHubError(response.status, message)
    }
    return response.status === 204 ? (undefined as T) : response.json()
  }

  /** Login des Token-Inhabers */
  async login() {
    return (await this.request<{ login: string }>('/user')).login
  }

  /** Repo-Infos: Standardbranch, Größe in KB und Schreibrecht */
  repository() {
    return this.request<{ default_branch: string; size: number; private: boolean; permissions?: { push: boolean } }>('/{repo}')
  }

  /** Commit-SHA eines Branches oder undefined, wenn es ihn nicht gibt */
  async branchSha(branch: string) {
    try {
      return (await this.request<{ object: { sha: string } }>(`/{repo}/git/ref/heads/${branch}`)).object.sha
    } catch (error) {
      if (error instanceof GitHubError && (error.status === 404 || error.status === 409)) return undefined
      throw error
    }
  }

  /** Legt einen Branch an oder setzt ihn; ohne force nur, wenn es ein Vorlauf ist */
  async setBranch(branch: string, sha: string, mode: 'create' | 'update' | 'force') {
    if (mode === 'create') return this.request('/{repo}/git/refs', { method: 'POST', body: { ref: `refs/heads/${branch}`, sha } })
    return this.request(`/{repo}/git/refs/heads/${branch}`, { method: 'PATCH', body: { sha, force: mode === 'force' } })
  }

  /** Alle Dateien eines Commits mit Blob-SHA und Größe */
  async tree(commitSha: string) {
    const { tree } = await this.request<{ tree: { path: string; type: string; sha: string; size: number }[] }>(`/{repo}/git/trees/${commitSha}?recursive=1`)
    return tree.filter((entry) => entry.type === 'blob')
  }

  /** Textinhalte vieler Dateien eines Commits, gebündelt über GraphQL */
  async texts(commitSha: string, paths: string[]) {
    const [owner, name] = this.repo.split('/')
    const result: Record<string, string> = {}
    for (let i = 0; i < paths.length; i += 100) {
      const batch = paths.slice(i, i + 100)
      const fields = batch.map((path, j) => `f${j}: object(expression: ${JSON.stringify(`${commitSha}:${path}`)}) { ... on Blob { text } }`)
      const query = `query { repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) { ${fields.join(' ')} } }`
      const { data, errors } = await this.request<{ data?: { repository: Record<string, { text: string } | null> }; errors?: { message: string }[] }>('/graphql', {
        method: 'POST',
        body: { query },
      })
      if (errors?.[0]) throw new GitHubError(400, errors[0].message)
      batch.forEach((path, j) => {
        const text = data?.repository[`f${j}`]?.text
        if (text !== undefined) result[path] = text
      })
    }
    return result
  }

  /** Binärinhalt einer Datei */
  async blob(sha: string) {
    const { content } = await this.request<{ content: string }>(`/{repo}/git/blobs/${sha}`)
    return new Blob([Uint8Array.from(atob(content.replace(/\n/g, '')), (c) => c.charCodeAt(0))])
  }

  /** Lädt eine Binärdatei hoch und liefert ihre Blob-SHA */
  async createBlob(data: Blob) {
    const bytes = new Uint8Array(await data.arrayBuffer())
    let binary = ''
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    return (await this.request<{ sha: string }>('/{repo}/git/blobs', { method: 'POST', body: { content: btoa(binary), encoding: 'base64' } })).sha
  }

  /** Neuer Commit aus Änderungen gegenüber dem Eltern-Commit; null löscht eine Datei */
  async commit(parent: string, message: string, changes: Record<string, { content: string } | { sha: string } | null>) {
    const { tree } = await this.request<{ tree: { sha: string } }>(`/{repo}/git/commits/${parent}`)
    const entries = Object.entries(changes).map(([path, change]) => ({ path, mode: '100644', type: 'blob', ...(change ?? { sha: null }) }))
    const created = await this.request<{ sha: string }>('/{repo}/git/trees', { method: 'POST', body: { base_tree: tree.sha, tree: entries } })
    return (await this.request<{ sha: string }>('/{repo}/git/commits', { method: 'POST', body: { message, tree: created.sha, parents: [parent] } })).sha
  }

  /** Erste Datei in einem leeren Repo, legt dabei den Standardbranch an */
  createFirstFile(path: string, content: string, message: string) {
    return this.request(`/{repo}/contents/${path}`, { method: 'PUT', body: { message, content: btoa(String.fromCharCode(...new TextEncoder().encode(content))) } })
  }

  /** Pull Requests von einem Branch, neueste zuerst */
  pulls(branch: string) {
    const owner = this.repo.split('/')[0]
    return this.request<{ number: number; html_url: string; state: string; merged_at: string | null; head: { sha: string } }[]>(
      `/{repo}/pulls?head=${owner}:${encodeURIComponent(branch)}&state=all&sort=created&direction=desc`,
    )
  }

  /** Erstellt einen Pull Request und liefert dessen Adresse */
  async createPull(branch: string, base: string, title: string) {
    return (await this.request<{ html_url: string }>('/{repo}/pulls', { method: 'POST', body: { head: branch, base, title } })).html_url
  }
}
