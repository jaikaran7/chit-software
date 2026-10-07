const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
}

export const CHATGPT_TABLE_PROMPT = `Convert the uploaded image into a clean tab-separated table.

Preserve every row and column exactly as shown.

Do not modify names, dates, numbers or amounts.

Do not calculate anything.

Do not add explanations.

Return ONLY the table.

Preserve the original column headings.

If a cell is blank, leave it blank.`

function monthIso(year: number, month: number): string | null {
  if (month < 1 || month > 12 || year < 2000 || year > 2100) return null
  return `${year}-${String(month).padStart(2, '0')}-01`
}

export function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/₹|rs\.?|inr/gi, '').replace(/\s/g, '').trim()
  if (!cleaned) return null
  const normalized = cleaned.replace(/,/g, '')
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null
  const value = Number(normalized)
  if (!Number.isFinite(value)) return null
  return Math.round(value * 100) / 100
}

export function parseMonth(raw: string): string | null {
  const text = raw.trim().replace(/\./g, '').replace(/,/g, '')
  if (!text) return null

  let match = text.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/)
  if (match) return monthIso(Number(match[1]), Number(match[2]))

  match = text.match(/^(\d{1,2})[/\- ](\d{4})$/)
  if (match) return monthIso(Number(match[2]), Number(match[1]))

  match = text.match(/^([A-Za-z]+)[/\- ]+(\d{4})$/)
  if (match) {
    const month = MONTHS[match[1].toLowerCase()]
    if (!month) return null
    return monthIso(Number(match[2]), month)
  }

  return null
}

function splitLine(line: string, delimiter: '\t' | '|' | ','): string[] {
  if (delimiter === '|') {
    const cells = line.split('|').map((cell) => cell.trim())
    if (cells[0] === '') cells.shift()
    if (cells[cells.length - 1] === '') cells.pop()
    return cells
  }
  return line.split(delimiter).map((cell) => cell.trim())
}

export function parseTable(input: string): { headers: string[]; rows: string[][] } {
  const lines = input
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0 && !/^[-|:\s]+$/.test(line.trim()))
  if (lines.length === 0) return { headers: [], rows: [] }
  const delimiter = lines[0].includes('\t') ? '\t' : lines[0].includes('|') ? '|' : ','
  const headers = splitLine(lines[0], delimiter)
  const rows = lines.slice(1).map((line) => {
    const cells = splitLine(line, delimiter)
    while (cells.length < headers.length) cells.push('')
    return cells
  })
  return { headers, rows }
}
