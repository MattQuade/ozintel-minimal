'use client';

import { useParams } from 'next/navigation';
import AccountingGate from '@/components/AccountingGate';
import VoiceNavBar from '@/components/VoiceNavBar';
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
      <div className="px-8 pt-6 max-w-5xl mx-auto">
        <VoiceNavBar
          variant="hub"
          examples={[
            'Edit issue date',
            'Edit due date',
            'Add new line item',
            'Edit description',
            'Edit notes',
          ]}
        />
      </div>
      <InvoiceEditorForm invoiceId={id} />
    </AccountingGate>
  );
}
