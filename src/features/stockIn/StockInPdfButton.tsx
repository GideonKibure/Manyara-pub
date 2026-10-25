import { Download } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { approvedStockIns, downloadApprovedStockInPdf, stockInsOnDay } from '@/features/stockIn/stockInPdf'
import { useApp } from '@/context/AppContext'
import { useI18n } from '@/i18n/LanguageContext'
import type { StockInTransaction } from '@/types'
import { cn } from '@/utils/cn'
import { formatDate } from '@/utils/dates'

export function StockInPdfButton({
  className,
  day,
  records,
  variant = 'secondary',
}: {
  className?: string
  day?: string
  records?: StockInTransaction[]
  variant?: 'secondary' | 'gold'
}) {
  const app = useApp()
  const { t } = useI18n()
  const source = records ?? app.stockIns
  const count = day ? stockInsOnDay(source, day).length : approvedStockIns(source).length
  return (
    <Button
      type="button"
      variant={variant}
      className={cn(className)}
      disabled={!count}
      onClick={() =>
        downloadApprovedStockInPdf({
          records: source,
          products: app.products,
          money: app.money,
          nameOf: app.nameOf,
          business: app.settings.businessName,
          title: day ? `${t('stockInPdfDayTitle')} · ${formatDate(day)}` : t('stockInPdfTitle'),
          deliveriesTitle: t('stockInPdfDeliveries'),
          linesTitle: t('stockInPdfLines'),
          productsTitle: t('stockInPdfProducts'),
          dateHeader: t('stockDate'),
          codeHeader: t('codeCol'),
          productHeader: t('reportColProduct'),
          qtyHeader: t('pdfQty'),
          costHeader: t('stockTotal'),
          supplierHeader: t('supplierCol'),
          invoiceHeader: t('stockInvoice'),
          employeeHeader: t('employeeCol'),
          deliveriesLabel: t('stockMany'),
          unitsLabel: t('dashUnits'),
          costLabel: t('stockTotal'),
          emptyNote: day ? t('stockInPdfDayEmpty') : t('stockInPdfEmpty'),
          day,
        })
      }
    >
      <Download className="h-4 w-4" />
      {day ? t('stockInPdfDay') : t('stockInPdf')}
    </Button>
  )
}
