// @vitest-environment jsdom
import { expect, it } from 'vitest'
import { svgSize } from './backgroundSize'

it('rechnet SVG-Pixel um und fällt auf viewBox oder das Standardquadrat zurück', () => {
  expect(svgSize('<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="700px"/>')).toEqual({ width: 22, height: 14 })
  expect(svgSize('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 10"/>')).toEqual({ width: 22, height: 5.5 })
  expect(svgSize('<svg xmlns="http://www.w3.org/2000/svg" width="100%"/>')).toEqual({ width: 22, height: 22 })
})
