import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { MantineProvider } from '@mantine/core'
import '@mantine/core/styles.css'
import { ErrorBoundary } from './ui/ErrorView'

/** Rendert eine Seite mit dem gemeinsamen Mantine-Theme in #root */
export function render(page: ReactNode) {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <MantineProvider defaultColorScheme="dark" theme={{ primaryColor: 'indigo' }}>
        <ErrorBoundary>{page}</ErrorBoundary>
      </MantineProvider>
    </StrictMode>,
  )
}
