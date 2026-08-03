'use client';

import { useParams } from 'next/navigation';
import AccountingGate from '@/components/AccountingGate';
import InvoiceEditorForm from '@/components/invoices/InvoiceEditorForm';

export default function EditInvoicePage() {
  const params = useParams();
  const id = String(params.id || '');

  return (
    <AccountingGate
      section="Invoices"
      backHref={`/invoices/${id}`}
      backLabel="← Back to invoice"
    >
      <InvoiceEditorForm invoiceId={id} />
    </AccountingGate>
  );
}
