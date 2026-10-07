import { asNumber, formatMoney, formatMonth, formatShortDate, methodLabel } from './format'
import type { ReceiptView } from '../services/receipts'

export type SlipLine = {
  label: string
  value: string
  emphasis?: boolean
}

export type SlipModel = {
  groupName: string
  kicker: string
  lines: SlipLine[]
  footer: string
  filename: string
  reversed: boolean
}

function collectionMonth(receipt: ReceiptView): string {
  const months = (receipt.allocations ?? [])
    .map((row) => row.due_month)
    .filter((month): month is string => Boolean(month))
    .map((month) => month.slice(0, 7))
  const unique = [...new Set(months)]
  if (unique.length === 1) return `${unique[0]}-01`
  return receipt.payment_date
}

export function buildSlip(receipt: ReceiptView): SlipModel {
  const collection = receipt.receipt_type === 'COLLECTION'
  const reversed = receipt.status === 'voided'
  const month = collection ? collectionMonth(receipt) : (receipt.actual_month ?? receipt.payment_date)
  const amount = collection ? receipt.amount : receipt.actual_amount
  const lines: SlipLine[] = [
    { label: collection ? 'Member' : 'Candidate', value: receipt.member_name },
    { label: 'Month', value: formatMonth(month) },
  ]
  if (
    !collection &&
    receipt.scheduled_amount != null &&
    asNumber(receipt.scheduled_amount) !== asNumber(receipt.actual_amount)
  ) {
    lines.push({ label: 'Scheduled amount', value: formatMoney(receipt.scheduled_amount) })
  }
  lines.push(
    { label: 'Amount', value: formatMoney(amount), emphasis: true },
    { label: 'Payment method', value: methodLabel(receipt.payment_method) },
    { label: 'Date', value: formatShortDate(receipt.payment_date) },
    { label: 'Receipt no', value: receipt.receipt_number },
  )
  return {
    groupName: receipt.group_name,
    kicker: collection ? 'Payment receipt' : 'Payout receipt',
    lines,
    footer: reversed ? 'Reversed' : collection ? 'Payment successful' : 'Payout sent',
    filename: `${receipt.receipt_number}.png`,
    reversed,
  }
}

const WIDTH = 360

function dashed(ctx: CanvasRenderingContext2D, y: number) {
  ctx.save()
  ctx.strokeStyle = '#1c1712'
  ctx.lineWidth = 1
  ctx.setLineDash([2, 3])
  ctx.beginPath()
  ctx.moveTo(28, y)
  ctx.lineTo(WIDTH - 28, y)
  ctx.stroke()
  ctx.restore()
}

function drawFit(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  weight: number,
  size: number,
  family: string,
) {
  let next = size
  ctx.font = `${weight} ${next}px ${family}`
  while (next > 12 && ctx.measureText(text).width > maxWidth) {
    next -= 1
    ctx.font = `${weight} ${next}px ${family}`
  }
  ctx.fillText(text, x, y)
}

export async function renderReceiptPng(model: SlipModel): Promise<Blob> {
  await document.fonts.ready
  const height = 128 + model.lines.length * 54 + 52
  const scale = 2
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH * scale
  canvas.height = height * scale
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not draw the receipt')
  ctx.scale(scale, scale)
  ctx.fillStyle = '#fffdf8'
  ctx.fillRect(0, 0, WIDTH, height)
  ctx.strokeStyle = '#1c1712'
  ctx.lineWidth = 1.5
  ctx.strokeRect(8, 8, WIDTH - 16, height - 16)

  ctx.textAlign = 'center'
  ctx.fillStyle = '#1c1712'
  drawFit(ctx, model.groupName, WIDTH / 2, 48, WIDTH - 64, 650, 26, 'Fraunces, Georgia, serif')
  ctx.font = '600 12px Outfit, sans-serif'
  ctx.fillStyle = '#6f6458'
  ctx.fillText(model.kicker, WIDTH / 2, 72)
  dashed(ctx, 90)

  let y = 118
  for (const line of model.lines) {
    ctx.textAlign = 'left'
    ctx.font = '500 12px Outfit, sans-serif'
    ctx.fillStyle = '#6f6458'
    ctx.fillText(line.label, 28, y)
    ctx.fillStyle = '#1c1712'
    if (line.emphasis) {
      drawFit(ctx, line.value, 28, y + 24, WIDTH - 56, 650, 22, 'Fraunces, Georgia, serif')
    } else {
      drawFit(ctx, line.value, 28, y + 22, WIDTH - 56, 600, 18, 'Outfit, sans-serif')
    }
    y += 54
  }

  dashed(ctx, y - 10)
  ctx.textAlign = 'center'
  ctx.font = '700 13px Outfit, sans-serif'
  ctx.fillStyle = model.reversed ? '#b8432f' : '#0e6b4f'
  ctx.fillText(model.footer, WIDTH / 2, y + 16)

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('Could not create the receipt image')
  return blob
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
