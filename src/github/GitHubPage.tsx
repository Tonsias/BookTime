import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Alert, Anchor, Badge, Button, Code, Container, Group, Modal, Paper, PasswordInput, Stack, Table, Text, TextInput, Textarea, Title } from '@mantine/core'
import { filesToBook, FormatTooNewError } from '../storage/format'
import { GitHub } from './api'
import { activeRepo, books, copies, token, type WorkingCopy } from './store'
import { commitLocal, committed, diff, load, openPull, push } from './sync'

const REPO = /^[\w.-]+\/[\w.-]+$/

const size = (kb: number) => (kb < 1024 ? `${kb} KB` : `${(kb / 1024).toFixed(1)} MB`)

/** Seite für alles, was mit GitHub zu tun hat: Token, Bücher, Änderungen, Commit, Push und Pull Request */
export function GitHubPage() {
  const [key, setKey] = useState(token.get())
  const [login, setLogin] = useState<string>()
  const [list, setList] = useState(books.get())
  const [active, setActive] = useState(activeRepo.get())
  const [selected, setSelected] = useState<string | null>(active ?? list[0] ?? null)
  const [copy, setCopy] = useState<WorkingCopy>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [guarded, setGuarded] = useState<{ copy: WorkingCopy; then: () => Promise<WorkingCopy | void> }>()

  useEffect(() => {
    // Browser soll die Arbeitskopien nicht bei Speicherknappheit löschen
    navigator.storage?.persist?.().catch(() => undefined)
  }, [])

  useEffect(() => {
    if (key) new GitHub(key, '').login().then(setLogin, (e: Error) => setError(`Token ungültig: ${e.message}`))
  }, [key])

  useEffect(() => {
    if (selected) copies.get(selected).then(setCopy)
  }, [selected])

  const run = async (action: () => Promise<WorkingCopy | void>) => {
    setBusy(true)
    setError(undefined)
    try {
      const next = await action()
      if (next) setCopy(next)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  /** Führt eine Aktion aus, die die Arbeitskopie ersetzt; mit offenen Änderungen erst nach Rückfrage */
  const guard = (stored: WorkingCopy | undefined, then: () => Promise<WorkingCopy | void>) => {
    if (stored && hasPending(stored)) setGuarded({ copy: stored, then })
    else run(then)
  }

  const show = (repo: string | null) => {
    activeRepo.set(repo)
    setActive(repo)
  }

  return (
    <Container size="md" py="xl">
      <Stack gap="lg">
        <Group justify="space-between">
          <Title order={2}>BookTime · GitHub</Title>
          <Anchor href="./">Zur Buchansicht</Anchor>
        </Group>
        {error && (
          <Alert color="red" withCloseButton onClose={() => setError(undefined)}>
            {error}
          </Alert>
        )}
        <TokenSection
          token={key}
          login={login}
          onChange={(value) => {
            token.set(value)
            setKey(value)
            setLogin(undefined)
          }}
        />
        <Section title="Bücher">
          <Table>
            <Table.Tbody>
              <Table.Tr>
                <Table.Td>Beispielbuch</Table.Td>
                <Table.Td>{active === null && <Badge>angezeigt</Badge>}</Table.Td>
                <Table.Td>
                  <Button size="xs" variant="default" onClick={() => show(null)} disabled={active === null}>
                    Anzeigen
                  </Button>
                </Table.Td>
              </Table.Tr>
              {list.map((repo) => (
                <Table.Tr key={repo} bg={repo === selected ? 'var(--mantine-color-default-hover)' : undefined}>
                  <Table.Td>{repo}</Table.Td>
                  <Table.Td>{active === repo && <Badge>angezeigt</Badge>}</Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      <Button size="xs" variant="default" onClick={() => setSelected(repo)}>
                        Auswählen
                      </Button>
                      <Button
                        size="xs"
                        variant="subtle"
                        color="red"
                        onClick={() =>
                          copies.get(repo).then((stored) =>
                            guard(stored, async () => {
                              await copies.delete(repo)
                              const next = list.filter((r) => r !== repo)
                              books.set(next)
                              setList(next)
                              if (active === repo) show(null)
                              if (selected === repo) setSelected(null)
                            }),
                          )
                        }
                      >
                        Entfernen
                      </Button>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          <AddBook
            onAdd={(repo) => {
              const next = [...new Set([...list, repo])]
              books.set(next)
              setList(next)
              setSelected(repo)
            }}
          />
        </Section>
        {selected && key && (
          <BookSection
            repo={selected}
            copy={copy?.repo === selected ? copy : undefined}
            token={key}
            busy={busy}
            shown={active === selected}
            onShow={() => show(selected)}
            run={run}
            guard={guard}
          />
        )}
        {guarded && <DiscardDialog copy={guarded.copy} token={key} onClose={() => setGuarded(undefined)} run={run} then={guarded.then} />}
      </Stack>
    </Container>
  )
}

const hasPending = (copy: WorkingCopy) => copy.commits.length > 0 || diff(committed(copy), copy.files).length > 0

function TokenSection({ token: value, login, onChange }: { token: string | null; login?: string; onChange: (token: string | null) => void }) {
  const [input, setInput] = useState('')
  return (
    <Section title="Zugang">
      {value ? (
        <Group>
          <Text size="sm">Angemeldet als {login ?? '…'}</Text>
          <Button size="xs" variant="default" onClick={() => onChange(null)}>
            Abmelden
          </Button>
        </Group>
      ) : (
        <Stack gap="xs">
          <Text size="sm" c="dimmed">
            Fine-grained Token auf github.com unter Settings → Developer settings anlegen: nur die Buch-Repos, Rechte Contents und Pull requests jeweils
            „Read and write“. Das Token bleibt nur in diesem Browser.
          </Text>
          <Group align="end">
            <PasswordInput flex={1} label="GitHub-Token" value={input} onChange={(e) => setInput(e.currentTarget.value)} />
            <Button onClick={() => onChange(input.trim())} disabled={!input.trim()}>
              Speichern
            </Button>
          </Group>
        </Stack>
      )}
    </Section>
  )
}

function AddBook({ onAdd }: { onAdd: (repo: string) => void }) {
  const [input, setInput] = useState('')
  const repo = input.trim().replace(/^https:\/\/github\.com\//, '')
  return (
    <Group align="end" mt="sm">
      <TextInput flex={1} label="Buch-Repo hinzufügen" placeholder="owner/repo" value={input} onChange={(e) => setInput(e.currentTarget.value)} />
      <Button
        variant="default"
        disabled={!REPO.test(repo)}
        onClick={() => {
          onAdd(repo)
          setInput('')
        }}
      >
        Hinzufügen
      </Button>
    </Group>
  )
}

interface BookSectionProps {
  repo: string
  copy?: WorkingCopy
  token: string
  busy: boolean
  shown: boolean
  onShow: () => void
  run: (action: () => Promise<WorkingCopy | void>) => void
  guard: (copy: WorkingCopy | undefined, then: () => Promise<WorkingCopy | void>) => void
}

function BookSection({ repo, copy, token: key, busy, shown, onShow, run, guard }: BookSectionProps) {
  const [message, setMessage] = useState('')
  const reload = () => guard(copy, () => load(key, repo))
  const checked = useMemo(() => {
    if (!copy) return undefined
    try {
      return { errors: filesToBook(copy.files, Object.keys(copy.images)).errors, changes: diff(committed(copy), copy.files) }
    } catch (error) {
      if (error instanceof FormatTooNewError) return { tooNew: error.message, errors: [], changes: [] }
      throw error
    }
  }, [copy])

  if (!copy || !checked)
    return (
      <Section title={repo}>
        <Button onClick={reload} loading={busy}>
          Laden
        </Button>
      </Section>
    )

  const { errors, changes } = checked
  const fileUrl = (path: string) => `https://github.com/${repo}/blob/${encodeURIComponent(copy.branch).replaceAll('%2F', '/')}/${path}`
  return (
    <Section title={repo}>
      <Stack gap="md">
        <Group gap="xl">
          <Info label="Branch">{copy.branch}</Info>
          <Info label="Stand">
            <Code>{copy.head.slice(0, 7)}</Code>
          </Info>
          <Info label="Repo-Größe">{size(copy.repoSize)}</Info>
          <Info label="Dateien">
            {Object.keys(copy.files).length} Text, {Object.keys(copy.images).length} Bilder
          </Info>
        </Group>
        <Group>
          <Button variant="default" onClick={reload} loading={busy}>
            Neu laden
          </Button>
          <Button variant="default" onClick={onShow} disabled={shown}>
            {shown ? 'Wird angezeigt' : 'In der Buchansicht anzeigen'}
          </Button>
        </Group>

        {'tooNew' in checked && (
          <Alert color="red" title="Buch ist neuer als diese BookTime-Version">
            <Text size="sm">{checked.tooNew}</Text>
            <Button mt="sm" size="xs" variant="white" color="red" onClick={() => location.reload()}>
              Neue Version laden
            </Button>
          </Alert>
        )}
        {errors.length > 0 && (
          <Alert color="red" title={`${errors.length} fehlerhafte Dateien – Commit erst nach dem Beheben möglich`}>
            {errors.map((e) => (
              <Text key={e.path + e.reason} size="sm">
                <Code>{e.path}</Code> {e.reason}{' '}
                <Anchor href={fileUrl(e.path)} target="_blank" size="sm">
                  Datei auf GitHub öffnen
                </Anchor>
              </Text>
            ))}
          </Alert>
        )}

        <div>
          <Text fw={600} mb="xs">
            Änderungen
          </Text>
          {changes.length === 0 ? (
            <Text size="sm" c="dimmed">
              Keine offenen Änderungen.
            </Text>
          ) : (
            changes.map(([path, kind]) => (
              <Text key={path} size="sm" component="div">
                <Badge size="xs" variant="light" mr="xs">
                  {kind}
                </Badge>
                <Code>{path}</Code>
              </Text>
            ))
          )}
          <Group align="end" mt="sm">
            <Textarea flex={1} label="Commit-Nachricht" autosize minRows={1} value={message} onChange={(e) => setMessage(e.currentTarget.value)} />
            <Button
              disabled={busy || !changes.length || !message.trim() || errors.length > 0}
              onClick={() =>
                run(async () => {
                  const next = await commitLocal(copy, message.trim())
                  setMessage('')
                  return next
                })
              }
            >
              Commit
            </Button>
          </Group>
        </div>

        <div>
          <Text fw={600} mb="xs">
            Lokale Commits
          </Text>
          {copy.commits.length === 0 ? (
            <Text size="sm" c="dimmed">
              Alles gepusht.
            </Text>
          ) : (
            copy.commits.map((c, i) => (
              <Text key={i} size="sm">
                {c.message} <Text span c="dimmed">({Object.keys(c.changes).length} Dateien)</Text>
              </Text>
            ))
          )}
          <Button mt="sm" disabled={busy || !copy.commits.length} onClick={() => run(() => push(key, copy))}>
            Push nach {copy.branch}
          </Button>
        </div>

        <div>
          <Text fw={600} mb="xs">
            Pull Request
          </Text>
          {copy.pullUrl ? (
            <Anchor href={copy.pullUrl} target="_blank">
              {copy.pullUrl}
            </Anchor>
          ) : (
            <Button variant="default" disabled={busy || copy.commits.length > 0} onClick={() => run(() => openPull(key, copy))}>
              Pull Request {copy.branch} → {copy.defaultBranch} erstellen
            </Button>
          )}
        </div>
      </Stack>
    </Section>
  )
}

function DiscardDialog(props: {
  copy: WorkingCopy
  token: string | null
  onClose: () => void
  run: (action: () => Promise<WorkingCopy | void>) => void
  then: () => Promise<WorkingCopy | void>
}) {
  const { copy, token: key, onClose, run, then } = props
  const open = diff(committed(copy), copy.files).length
  const act = (action: () => Promise<WorkingCopy | void>) => {
    onClose()
    run(action)
  }
  return (
    <Modal opened onClose={onClose} title="Nicht gepushte Änderungen">
      <Stack gap="md">
        <Text size="sm">
          Die Arbeitskopie von {copy.repo} hat {open} offene Änderungen und {copy.commits.length} lokale Commits. Sie gingen verloren.
        </Text>
        {open > 0 && (
          <Text size="sm" c="dimmed">
            Offene Änderungen bitte zuerst committen, dann lassen sie sich hier pushen.
          </Text>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Abbrechen
          </Button>
          <Button disabled={!key || open > 0 || !copy.commits.length} onClick={() => act(async () => (await push(key!, copy), then()))}>
            Erst pushen
          </Button>
          <Button color="red" onClick={() => act(then)}>
            Verwerfen
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Paper withBorder p="lg" radius="md">
      <Title order={4} mb="md">
        {title}
      </Title>
      {children}
    </Paper>
  )
}

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text size="sm">{children}</Text>
    </div>
  )
}
