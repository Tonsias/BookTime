import { Component, type ReactNode } from 'react'
import { Alert, Anchor, Button, Code, Container, Group, Stack, Text } from '@mantine/core'
import { FormatTooNewError } from '../storage/format'

/** Sofort-Ausbesserung zu einem Fehler: Knopf mit Aktion oder Link */
export interface Fix {
  label: string
  run?: () => void
  href?: string
}

/** Zeigt, was schiefgeht, und bietet passende Sofort-Ausbesserungen an */
export function ErrorView({ title, message, fixes }: { title: string; message: ReactNode; fixes: Fix[] }) {
  return (
    <Container size="sm" py="xl">
      <Alert color="red" title={title}>
        <Stack gap="md">
          <Text size="sm" component="div">
            {message}
          </Text>
          <Group>
            {fixes.map((fix) =>
              fix.href ? (
                <Anchor key={fix.label} href={fix.href} size="sm">
                  {fix.label}
                </Anchor>
              ) : (
                <Button key={fix.label} size="xs" variant="white" color="red" onClick={fix.run}>
                  {fix.label}
                </Button>
              ),
            )}
          </Group>
        </Stack>
      </Alert>
    </Container>
  )
}

const reload: Fix = { label: 'Seite neu laden', run: () => location.reload() }

const fixesFor = (error: Error): { title: string; fixes: Fix[] } =>
  error instanceof FormatTooNewError
    ? { title: 'Buch ist neuer als diese BookTime-Version', fixes: [{ ...reload, label: 'Neue Version laden' }] }
    : { title: 'Unerwarteter Fehler', fixes: [reload] }

/** Fehler mit den zu ihm passenden Ausbesserungen */
export function ErrorPage({ error }: { error: Error }) {
  const { title, fixes } = fixesFor(error)
  return <ErrorView title={title} message={<Code block>{error.message}</Code>} fixes={fixes} />
}

/** Fängt unerwartete Fehler einer Seite ab und zeigt sie mit Ausbesserungen statt einer weißen Seite */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {}
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  render() {
    const { error } = this.state
    return error ? <ErrorPage error={error} /> : this.props.children
  }
}
