import { Download } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { approvedStockIns, downloadApprovedStockInPdf } from '@/features/stockIn/stockInPdf'
import { useApp } from '@/context/AppContext'
import { useI18n } from '@/i18n/LanguageContext'
import { cn } from '@/utils/cn'

export function StockInPdfButton({ className }: { className?: string }) {
  const app = useApp()
  const { t } = useI18n()
  const count = approvedStockIns(app.stockIns).length
  return (
    <Button
      type="button"
      variant="secondary"
      className={cn(className)}
      disabled={!count}
      onClick={() =>
        downloadApprovedStockInPdf({
          records: app.stockIns,
          products: app.products,
          money: app.money,
          nameOf: app.nameOf,
          business: app.settings.businessName,
          title: t('stockInPdfTitle'),
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
          emptyNote: t('stockInPdfEmpty'),
        })
      }
    >
      <Download className="h-4 w-4" />
      {t('stockInPdf')}
    </Button>
  )
}
