const ADDRESS = /^[\w.-]+\/[\w.-]+(\/[\w.-]+)*$/
const LINK = 'https://github.com/'

/** Prüft eine eingegebene Buch-Adresse `owner/repo` oder `owner/repo/pfad`; liefert sie bereinigt oder einen Fehlertext */
export function parseAddress(input: string): { address: string } | { error: string } {
  const text = input.trim().replace(/\/+$/, '')
  const address = text.startsWith(LINK) ? text.slice(LINK.length) : text
  if (text.startsWith(LINK) && /^[^/]+\/[^/]+\/(tree|blob)\//.test(address)) return { error: 'Bitte als owner/repo/ordner angeben.' }
  const valid = ADDRESS.test(address) && !address.split('/').some((part) => /^\.+$/.test(part))
  return valid ? { address } : { error: '' }
}

/** Repo (`owner/repo`) und Pfad des Buchs darin, ohne `/` am Ende; leer im Stammverzeichnis */
export function splitAddress(address: string) {
  const [owner, name, ...path] = address.split('/')
  return { repo: `${owner}/${name}`, path: path.join('/') }
}
