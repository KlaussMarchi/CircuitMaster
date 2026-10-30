export const PX_PER_INCH  = 90
export const MIL_PER_INCH = 1000

const UNITS: [string, number][] = [['cm', 2.54], ['mm', 25.4], ['in', 1], ['px', PX_PER_INCH], ['mil', MIL_PER_INCH], ['pt', 72], ['pc', 6]]

const ILLUSTRATOR_PX = 72

export const toInches = (text: string | null | undefined, illustrator = false) => {
    const value = (text ?? '').trim()
    const unit  = UNITS.find(([suffix]) => value.toLowerCase().endsWith(suffix))

    if (!unit) {
        const digits = value.replace(/[^\d.]+$/, '')
        return digits ? toNumber(digits, PX_PER_INCH) : null
    }

    const divisor = unit[0] === 'px' && illustrator ? ILLUSTRATOR_PX : unit[1]
    return toNumber(value.slice(0, -unit[0].length), divisor)
}

const toNumber = (text: string, divisor: number) => {
    const number = text.trim() === '' ? NaN : Number(text)
    return Number.isFinite(number) ? number / divisor : null
}

export const milsToPx = (mils: number) => mils * PX_PER_INCH / MIL_PER_INCH

export const pxToMils = (px: number) => px * MIL_PER_INCH / PX_PER_INCH

// COMPRIMENTO NA UNIDADE DA PCB: mm COM 3 CASAS (1 µm), mil COM 1 CASA
export const formatLength = (mils: number, unit: 'mm' | 'mil') => unit === 'mm' ? `${(mils * 25.4 / MIL_PER_INCH).toFixed(3)} mm` : `${mils.toFixed(1)} mil`
