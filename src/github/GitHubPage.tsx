import { useEffect, useState, type ReactNode } from 'react'
import { Alert, Anchor, Badge, Button, Code, Container, Group, Paper, PasswordInput, Stack, Table, Text, TextInput, Textarea, Title } from '@mantine/core'
import { filesToBook } from '../storage/format'
import { GitHub } from './api'
import { activeRepo, books, copies, token, type WorkingCopy } from './store'
import { commitLocal, committed, diff, load, openPull, push } from './sync'

const REPO = /^[\w.-]+\/[\w.-]+$/

const megabytes = (kb: number) => `${(kb / 1024).toFixed(1)} MB`

/** Seite für alles, was mit GitHub zu tun hat: Token, Bücher, Änderungen, Commit, Push und Pull Request */
export function GitHubPage() {
  const [key, setKey] = useState(token.get())
  const [login, setLogin] = useState<string>()
  const [list, setList] = useState(books.get())
  const [active, setActive] = useState(activeRepo.get())
  const [selected, setSelected] = useState<string | null>(active)
  const [copy, setCopy] = useState<WorkingCopy>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

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
                          run(async () => {
                            const stored = await copies.get(repo)
                            if (stored && hasPending(stored) && !confirm(`${repo} hat nicht gepushte Änderungen. Trotzdem entfernen?`)) return
                            await copies.delete(repo)
                            const next = list.filter((r) => r !== repo)
                            books.set(next)
                            setList(next)
                            if (active === repo) show(null)
                            if (selected === repo) setSelected(null)
                          })
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
          />
        )}
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
}

function BookSection({ repo, copy, token: key, busy, shown, onShow, run }: BookSectionProps) {
  const [message, setMessage] = useState('')
  const reload = () =>
    run(async () => {
      if (copy && hasPending(copy) && !confirm('Nicht gepushte Änderungen gehen beim Neuladen verloren. Trotzdem neu laden?')) return
      return load(key, repo)
    })

  if (!copy)
    return (
      <Section title={repo}>
        <Button onClick={reload} loading={busy}>
          Laden
        </Button>
      </Section>
    )

  const { errors } = filesToBook(copy.files)
  const changes = diff(committed(copy), copy.files)
  return (
    <Section title={repo}>
      <Stack gap="md">
        <Group gap="xl">
          <Info label="Branch">{copy.branch}</Info>
          <Info label="Stand">
            <Code>{copy.head.slice(0, 7)}</Code>
          </Info>
          <Info label="Repo-Größe">{megabytes(copy.repoSize)}</Info>
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

        {errors.length > 0 && (
          <Alert color="red" title={`${errors.length} fehlerhafte Dateien – Commit erst nach dem Beheben möglich`}>
            {errors.map((e) => (
              <Text key={e.path + e.reason} size="sm">
                <Code>{e.path}</Code> {e.reason}
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
              <Text key={path} size="sm">
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
