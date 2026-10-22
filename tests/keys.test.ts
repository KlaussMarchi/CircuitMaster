import { describe, expect, it } from 'vitest'
import { assignKey, getKeyMap, KEY_ACTIONS, keyOf, shortcutOf, showKey } from '../src/ui/Keys'

const press = (key: string, modifiers: { ctrl?: boolean, alt?: boolean, shift?: boolean } = {}) => keyOf({ key, ctrlKey: modifiers.ctrl ?? false, metaKey: false, altKey: modifiers.alt ?? false, shiftKey: modifiers.shift ?? false })

describe('atalhos de teclado', () => {
    it('cada tecla padrão aciona uma ação só, e as ações têm nomes distintos', () => {
        const keys = KEY_ACTIONS.flatMap(action => action.keys)
        expect(keys.filter((key, i) => keys.indexOf(key) !== i)).toEqual([])
        expect(new Set(KEY_ACTIONS.map(action => action.id)).size).toBe(KEY_ACTIONS.length)
        expect(getKeyMap({}).size).toBe(keys.length)
    })

    it('mostra a tecla como no menu do Fritzing', () => {
        expect(['ctrl++', 'ctrl+}', 'ctrl+)', 'escape', 'alt+backspace', 'ctrl+shift+z', '|', 'ctrl+,', 'shift+arrowup'].map(showKey)).toEqual(['Ctrl++', 'Ctrl+Shift+]', 'Ctrl+Shift+0', 'Esc', 'Alt+Backspace', 'Ctrl+Shift+Z', '|', 'Ctrl+,', 'Shift+↑'])
    })

    it('lê o evento do teclado: o símbolo já traz o Shift, a letra o leva no nome', () => {
        expect([press('}', { ctrl: true, shift: true }), press('Z', { ctrl: true, shift: true }), press('Backspace', { alt: true }), press('ArrowUp', { shift: true }), press('|', { shift: true })]).toEqual(['ctrl+}', 'ctrl+shift+z', 'alt+backspace', 'shift+arrowup', '|'])
    })

    it('a tecla escolhida para uma ação sai da que a tinha; voltar ao padrão a devolve', () => {
        const custom = assignKey({}, 'copy', 'ctrl+d')

        expect(getKeyMap(custom).get('ctrl+d')?.id).toBe('copy')
        expect(getKeyMap(custom).get('ctrl+c')).toBeUndefined()
        expect(shortcutOf(custom, 'copy')).toBe('Ctrl+D')
        expect(shortcutOf(custom, 'duplicate')).toBeUndefined()

        const moved = assignKey(custom, 'paste', 'ctrl+d')
        expect(moved.copy).toEqual([])
        expect(getKeyMap(moved).get('ctrl+d')?.id).toBe('paste')

        const reset = assignKey(assignKey(moved, 'paste', null), 'copy', null)
        expect(reset).toEqual({})
        expect(shortcutOf(reset, 'duplicate')).toBe('Ctrl+D')
    })
})
