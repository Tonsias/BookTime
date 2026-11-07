// @vitest-environment jsdom
import { useState, type ReactNode } from 'react'
import { MantineProvider } from '@mantine/core'
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { hints } from '../checks'
import { timeline, type Book } from '../model'
import { filesToBook } from '../storage/format'
import { sampleFiles } from '../storage/sample'
import { UiContext, type BookUi } from './context'
import { DeleteDialog, HintDialog } from './Dialogs'
import { Inline, Markdown, Picker } from './fields'

beforeAll(() => {
  // Mantine fragt Medienabfragen und Größenänderungen ab, jsdom kennt beides nicht
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} }))
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Element.prototype.scrollIntoView = () => {}
})
afterEach(cleanup)

const sample = filesToBook(sampleFiles).book

function Harness({ children, book = sample, request = null, extra = {} }: { children: ReactNode; book?: Book; request?: string | null; extra?: Partial<BookUi> }) {
  const [editRequest, requestEdit] = useState(request)
  const ui: BookUi = {
    book,
    points: timeline(book),
    current: 0,
    scope: 'hier',
    hints: hints(book),
    selection: null,
    sample: true,
    change: () => true,
    select: () => {},
    jump: () => {},
    remove: () => {},
    openHint: () => {},
    editRequest,
    requestEdit,
    expanded: new Set(),
    toggle: () => {},
    upload: async () => '',
    imageUrl: async () => undefined,
    ...extra,
  }
  return (
    <MantineProvider env="test">
      <UiContext.Provider value={ui}>{children}</UiContext.Provider>
    </MantineProvider>
  )
}

describe('Text, der beim Klick editierbar wird', () => {
  const setup = (request: string | null = null) => {
    const onA = vi.fn()
    const onB = vi.fn()
    render(
      <Harness request={request}>
        <Inline field="a" value="Anna" label="Name" onCommit={onA} />
        <Inline field="b" value="" label="Notiz" placeholder="Notiz hinzufügen …" onCommit={onB} />
      </Harness>,
    )
    return { onA, onB, user: userEvent.setup() }
  }

  it('übernimmt mit Enter', async () => {
    const { onA, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Name bearbeiten' }))
    await user.clear(screen.getByRole('textbox', { name: 'Name' }))
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Anja{Enter}')
    expect(onA).toHaveBeenCalledWith('Anja')
  })

  it('verwirft mit Esc und übernimmt nichts Unverändertes', async () => {
    const { onA, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Name bearbeiten' }))
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'xyz{Escape}')
    await user.click(screen.getByRole('button', { name: 'Name bearbeiten' }))
    await user.keyboard('{Enter}')
    expect(onA).not.toHaveBeenCalled()
  })

  it('übernimmt mit Tab und öffnet das nächste Feld', async () => {
    const { onA, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Name bearbeiten' }))
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'a{Tab}')
    expect(onA).toHaveBeenCalledWith('Annaa')
    expect(await screen.findByRole('textbox', { name: 'Notiz' })).toBeTruthy()
  })

  it('startet nach dem Anlegen sofort in Bearbeitung mit markiertem Text', async () => {
    setup('a')
    const input = screen.getByRole<HTMLInputElement>('textbox', { name: 'Name' })
    await act(async () => input.focus())
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 4])
  })
})

describe('Suchliste mit Anlegen', () => {
  const setup = () => {
    const onPick = vi.fn()
    const create = vi.fn()
    render(
      <Harness>
        <Picker opened onClose={() => {}} title="Ort" options={[{ id: 'v', label: 'Velmar' }, { id: 'k', label: 'Kloster' }]} onPick={onPick} creates={[{ label: (q) => `„${q}“ als Ort anlegen`, run: create }]} target={<button type="button">Ort</button>} />
      </Harness>,
    )
    return { onPick, create, user: userEvent.setup() }
  }

  it('wählt mit Pfeiltasten und Enter', async () => {
    const { onPick, user } = setup()
    await user.keyboard('{ArrowDown}{Enter}')
    expect(onPick).toHaveBeenCalledWith('k')
  })

  it('bietet bei unbekanntem Text das Anlegen an', async () => {
    const { create, user } = setup()
    await user.keyboard('Hafen')
    await user.click(screen.getByRole('option', { name: /„Hafen“ als Ort anlegen/ }))
    expect(create).toHaveBeenCalledWith('Hafen')
  })
})

it('Löschdialog listet, was mitgeht, und löscht erst nach Bestätigung', async () => {
  const onConfirm = vi.fn()
  render(
    <Harness>
      <DeleteDialog name="Anna" items={['Aufenthalt: Velmar']} onConfirm={onConfirm} onClose={() => {}} />
    </Harness>,
  )
  expect(await screen.findByText('Aufenthalt: Velmar')).toBeTruthy()
  await userEvent.setup().click(screen.getByRole('button', { name: 'Löschen' }))
  expect(onConfirm).toHaveBeenCalled()
})

it('Hinweis-Dialog zeigt Lösungen mit Vorschau und meldet die gewählte', async () => {
  const anna = sample.persons.find((p) => p.name === 'Anna')!
  const book = { ...sample, persons: sample.persons.map((p) => (p === anna ? { ...p, existence: { at: timeline(sample)[4]!.id } } : p)) }
  const onFix = vi.fn()
  render(
    <Harness book={book}>
      <HintDialog index={0} accepting={false} onAccepting={() => {}} onIndex={() => {}} onClose={() => {}} onFix={onFix} onAccept={() => {}} onSelf={() => {}} />
    </Harness>,
  )
  expect(screen.getByText(/^Hinweis 1 von/)).toBeTruthy()
  await userEvent.setup().click(screen.getByText(/Existenz von Anna erweitern/))
  expect(onFix).toHaveBeenCalledWith(expect.objectContaining({ rule: 'outside-existence' }), expect.objectContaining({ label: 'Existenz von Anna erweitern' }))
})

it('Markdown formatiert, öffnet Links sicher und übernimmt kein rohes HTML', () => {
  const text = '**fett** und *kursiv*\n\n[Karte](https://example.org) <script>alert(1)</script><b>roh</b>'
  const { container } = render(
    <Harness>
      <Markdown>{text}</Markdown>
    </Harness>,
  )
  expect(container.querySelector('strong')?.textContent).toBe('fett')
  expect(container.querySelector('em')?.textContent).toBe('kursiv')
  expect(container.querySelector('a')?.outerHTML).toBe('<a href="https://example.org" target="_blank" rel="noreferrer">Karte</a>')
  expect(container.querySelector('script')).toBeNull()
  expect(container.querySelector('b')).toBeNull()
})
