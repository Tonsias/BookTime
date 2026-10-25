import { renderToStaticMarkup } from 'react-dom/server'
import { MantineProvider } from '@mantine/core'
import { expect, it } from 'vitest'
import { timeline, type Book } from '../model'
import { filesToBook } from '../storage/format'
import { sampleFiles } from '../storage/sample'
import { FocusPanel } from './FocusPanel'

const sample = filesToBook(sampleFiles).book
const anna = sample.persons.find((p) => p.name === 'Anna')!
const description = '**fett** und *kursiv*\n\n- Punkt\n\n[Karte](https://example.org) <script>alert(1)</script><b>roh</b>'
const book: Book = { ...sample, persons: sample.persons.map((p) => (p === anna ? { ...p, description } : p)) }

const html = renderToStaticMarkup(
  <MantineProvider>
    <FocusPanel
      book={book}
      hints={[]}
      imageUrl={async () => undefined}
      points={timeline(book)}
      current={0}
      selection={{ kind: 'person', id: anna.id }}
      onSelect={() => undefined}
      onJump={() => undefined}
    />
  </MantineProvider>,
)

it('stellt Beschreibungen als Markdown dar', () => {
  expect(html).toContain('<strong>fett</strong>')
  expect(html).toContain('<em>kursiv</em>')
  expect(html).toContain('<li>Punkt</li>')
})

it('öffnet Links in einem neuen Tab ohne Verweis zurück', () => {
  expect(html).toContain('<a href="https://example.org" target="_blank" rel="noreferrer">Karte</a>')
})

it('übernimmt kein rohes HTML aus dem Text', () => {
  expect(html).not.toContain('<script')
  expect(html).not.toContain('<b>roh</b>')
})
