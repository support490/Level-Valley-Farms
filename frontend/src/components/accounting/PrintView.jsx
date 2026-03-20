import { useState, useEffect } from 'react'
import { getInvoicePrintView, getEstimatePrintView, getCheckPrintView, emailInvoice } from '../../api/accounting'
import { getLogoUrl } from '../../api/settings'
import useToast from '../../hooks/useToast'
import Toast from '../common/Toast'

const fmt = (n) =>
  typeof n === 'number'
    ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '0.00'

export default function PrintView({ type, id, onClose }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [logoExists, setLogoExists] = useState(false)
  const [emailing, setEmailing] = useState(false)
  const { toast, showToast, hideToast } = useToast()

  useEffect(() => {
    loadData()
    checkLogo()
  }, [type, id])

  const loadData = async () => {
    setLoading(true)
    try {
      let res
      if (type === 'invoice') res = await getInvoicePrintView(id)
      else if (type === 'estimate') res = await getEstimatePrintView(id)
      else if (type === 'check') res = await getCheckPrintView(id)
      setData(res.data)
    } catch (err) {
      showToast('Failed to load print view', 'error')
    } finally {
      setLoading(false)
    }
  }

  const checkLogo = () => {
    const img = new Image()
    img.onload = () => setLogoExists(true)
    img.onerror = () => setLogoExists(false)
    img.src = getLogoUrl()
  }

  const handlePrint = () => window.print()

  const handleEmail = async () => {
    if (type !== 'invoice') return
    setEmailing(true)
    try {
      await emailInvoice(id)
      showToast('Invoice emailed successfully')
    } catch (err) {
      showToast(err.response?.data?.detail || 'Failed to send email', 'error')
    } finally {
      setEmailing(false)
    }
  }

  if (loading) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#666', fontSize: 14 }}>Loading...</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
        <p style={{ color: '#666', fontSize: 14 }}>Unable to load document.</p>
        <button onClick={onClose} style={{ background: '#f0f0f0', color: '#333', border: '1px solid #b0b0b0', padding: '6px 20px', borderRadius: 3, fontSize: 13, cursor: 'pointer' }}>Close</button>
      </div>
    )
  }

  const isCheck = type === 'check'
  const company = data.company || {}
  const doc = data.document || {}
  const check = data.check || {}
  const logoUrl = company.logo_url || (logoExists ? getLogoUrl() : null)
  const docTitle = type === 'invoice' ? 'INVOICE' : type === 'estimate' ? 'ESTIMATE' : 'CHECK'

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: '#e8e8e8', overflowY: 'auto' }}>
      {toast && <Toast {...toast} onClose={hideToast} />}

      {/* ── Toolbar (hidden during print) ── */}
      <div
        className="no-print"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 24px',
          borderBottom: '1px solid #ccc',
          background: '#f5f5f5',
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#333' }}>
          Print Preview &mdash; {docTitle}
        </h2>
        <div style={{ display: 'flex', gap: 8 }}>
          {type === 'invoice' && (
            <button
              onClick={handleEmail}
              disabled={emailing}
              style={{
                background: '#2e7d32',
                color: 'white',
                border: '1px solid #256b28',
                padding: '6px 20px',
                borderRadius: 3,
                fontSize: 13,
                cursor: emailing ? 'not-allowed' : 'pointer',
                fontWeight: 600,
                opacity: emailing ? 0.6 : 1,
              }}
            >
              {emailing ? 'Sending...' : 'Email Invoice'}
            </button>
          )}
          <button
            onClick={handlePrint}
            style={{
              background: '#336699',
              color: 'white',
              border: '1px solid #2a5580',
              padding: '6px 20px',
              borderRadius: 3,
              fontSize: 13,
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Print
          </button>
          <button
            onClick={onClose}
            style={{
              background: '#f0f0f0',
              color: '#333',
              border: '1px solid #b0b0b0',
              padding: '6px 20px',
              borderRadius: 3,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>

      {/* ── Document Area ── */}
      <div
        style={{
          maxWidth: 850,
          margin: '24px auto',
          background: '#ffffff',
          boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
          padding: 0,
        }}
      >
        {isCheck ? (
          <CheckLayout company={company} check={check} logoUrl={logoUrl} />
        ) : (
          <DocumentLayout company={company} doc={doc} docTitle={docTitle} logoUrl={logoUrl} />
        )}
      </div>

      {/* ── Print-only styles ── */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; padding: 0; background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          @page { margin: 0.4in; size: letter; }
        }
      `}</style>
    </div>
  )
}


/* ═══════════════════════════════════════════════════════
   Invoice / Estimate Layout
   ═══════════════════════════════════════════════════════ */
function DocumentLayout({ company, doc, docTitle, logoUrl }) {
  const lineItems = doc.line_items || []

  return (
    <div style={{ padding: '48px 56px 40px', fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif", color: '#222', fontSize: 13, lineHeight: 1.5 }}>

      {/* ── Company Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
          {logoUrl && (
            <img
              src={logoUrl}
              alt="Company Logo"
              style={{ maxWidth: 80, maxHeight: 80, objectFit: 'contain', borderRadius: 4 }}
            />
          )}
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#336699', marginBottom: 2 }}>
              {company.name || 'Company Name'}
            </div>
            {company.address && (
              <div style={{ fontSize: 11, color: '#555', whiteSpace: 'pre-line' }}>{company.address}</div>
            )}
            {company.phone && (
              <div style={{ fontSize: 11, color: '#555' }}>{company.phone}</div>
            )}
            {company.email && (
              <div style={{ fontSize: 11, color: '#555' }}>{company.email}</div>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#336699', letterSpacing: 2 }}>
            {docTitle}
          </div>
        </div>
      </div>

      {/* ── Document Info & Bill To ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 28 }}>
        {/* Bill To */}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#336699', textTransform: 'uppercase', marginBottom: 4, letterSpacing: 1 }}>
            Bill To
          </div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{doc.customer_name || ''}</div>
          {doc.customer_address && (
            <div style={{ fontSize: 12, color: '#555', whiteSpace: 'pre-line', marginTop: 2 }}>{doc.customer_address}</div>
          )}
        </div>

        {/* Document Info Grid */}
        <div style={{ width: 260 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <tbody>
              {[
                { label: `${docTitle} #`, value: doc.number },
                { label: 'Date', value: doc.date },
                { label: 'Due Date', value: doc.due_date },
                { label: 'Terms', value: doc.terms },
              ].filter(r => r.value).map((row, i) => (
                <tr key={i}>
                  <td style={{ padding: '4px 12px 4px 0', fontWeight: 600, color: '#336699', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {row.label}:
                  </td>
                  <td style={{ padding: '4px 0', color: '#333' }}>
                    {row.value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Line Items Table ── */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 24 }}>
        <thead>
          <tr>
            {['#', 'Description', 'Qty', 'Rate', 'Amount'].map((h, i) => (
              <th
                key={i}
                style={{
                  background: '#336699',
                  color: 'white',
                  padding: '8px 12px',
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  textAlign: i === 0 ? 'center' : i >= 2 ? 'right' : 'left',
                  borderBottom: '2px solid #2a5580',
                  width: i === 0 ? 40 : i === 1 ? 'auto' : 90,
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lineItems.map((item, idx) => (
            <tr key={idx} style={{ background: idx % 2 === 0 ? '#f9fbfd' : '#ffffff' }}>
              <td style={{ padding: '8px 12px', textAlign: 'center', borderBottom: '1px solid #e0e0e0', color: '#888', fontSize: 12 }}>
                {idx + 1}
              </td>
              <td style={{ padding: '8px 12px', borderBottom: '1px solid #e0e0e0', fontSize: 13 }}>
                {item.description}
              </td>
              <td style={{ padding: '8px 12px', textAlign: 'right', borderBottom: '1px solid #e0e0e0', fontSize: 13 }}>
                {item.quantity != null ? item.quantity : ''}
              </td>
              <td style={{ padding: '8px 12px', textAlign: 'right', borderBottom: '1px solid #e0e0e0', fontSize: 13 }}>
                {item.rate != null ? `$${fmt(item.rate)}` : ''}
              </td>
              <td style={{ padding: '8px 12px', textAlign: 'right', borderBottom: '1px solid #e0e0e0', fontSize: 13, fontWeight: 500 }}>
                ${fmt(item.amount)}
              </td>
            </tr>
          ))}
          {lineItems.length === 0 && (
            <tr>
              <td colSpan={5} style={{ padding: '20px 12px', textAlign: 'center', color: '#999', borderBottom: '1px solid #e0e0e0' }}>
                No line items
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* ── Totals ── */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 32 }}>
        <div style={{ width: 280 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              <tr>
                <td style={{ padding: '6px 12px 6px 0', textAlign: 'right', fontSize: 13, color: '#555' }}>Subtotal:</td>
                <td style={{ padding: '6px 0', textAlign: 'right', fontSize: 13 }}>${fmt(doc.subtotal)}</td>
              </tr>
              {doc.tax != null && doc.tax > 0 && (
                <tr>
                  <td style={{ padding: '6px 12px 6px 0', textAlign: 'right', fontSize: 13, color: '#555' }}>Tax:</td>
                  <td style={{ padding: '6px 0', textAlign: 'right', fontSize: 13 }}>${fmt(doc.tax)}</td>
                </tr>
              )}
              <tr>
                <td style={{ padding: '8px 12px 8px 0', textAlign: 'right', fontSize: 14, fontWeight: 700, borderTop: '2px solid #336699', color: '#336699' }}>Total:</td>
                <td style={{ padding: '8px 0', textAlign: 'right', fontSize: 14, fontWeight: 700, borderTop: '2px solid #336699', color: '#336699' }}>${fmt(doc.total)}</td>
              </tr>
              {doc.amount_paid != null && doc.amount_paid > 0 && (
                <tr>
                  <td style={{ padding: '6px 12px 6px 0', textAlign: 'right', fontSize: 13, color: '#555' }}>Amount Paid:</td>
                  <td style={{ padding: '6px 0', textAlign: 'right', fontSize: 13, color: '#2e7d32' }}>-${fmt(doc.amount_paid)}</td>
                </tr>
              )}
              {doc.balance_due != null && (
                <tr>
                  <td style={{ padding: '10px 12px 10px 0', textAlign: 'right', fontSize: 16, fontWeight: 700, borderTop: '1px solid #ccc' }}>Balance Due:</td>
                  <td style={{ padding: '10px 0', textAlign: 'right', fontSize: 16, fontWeight: 700, borderTop: '1px solid #ccc', color: doc.balance_due > 0 ? '#c62828' : '#2e7d32' }}>
                    ${fmt(doc.balance_due)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Notes & Footer ── */}
      {doc.notes && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#336699', textTransform: 'uppercase', marginBottom: 4, letterSpacing: 1 }}>
            Notes
          </div>
          <div style={{ fontSize: 12, color: '#555', whiteSpace: 'pre-line', padding: '8px 0', borderTop: '1px solid #e8e8e8' }}>
            {doc.notes}
          </div>
        </div>
      )}

      {doc.footer && (
        <div style={{ borderTop: '1px solid #e0e0e0', paddingTop: 12, marginTop: 16, textAlign: 'center', fontSize: 11, color: '#888' }}>
          {doc.footer}
        </div>
      )}
    </div>
  )
}


/* ═══════════════════════════════════════════════════════
   Check Layout
   ═══════════════════════════════════════════════════════ */
function CheckLayout({ company, check, logoUrl }) {
  const expenseLines = check.expense_lines || []
  const lineTotal = expenseLines.reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0)

  const VoucherStub = () => (
    <div style={{ padding: '16px 40px', borderTop: '2px dashed #999' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 11, fontWeight: 600, color: '#333' }}>
        <span>Check #{check.number || 'To Print'}</span>
        <span>{check.date}</span>
        <span>{check.payee}</span>
        <span>${fmt(check.amount)}</span>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid #999', fontWeight: 600, color: '#336699' }}>Account</th>
            <th style={{ textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid #999', fontWeight: 600, color: '#336699' }}>Description</th>
            <th style={{ textAlign: 'right', padding: '4px 8px', borderBottom: '1px solid #999', fontWeight: 600, color: '#336699' }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {expenseLines.map((line, idx) => (
            <tr key={idx}>
              <td style={{ padding: '3px 8px', borderBottom: '1px solid #e8e8e8' }}>{line.account_name || `Account ${line.account_id || ''}`}</td>
              <td style={{ padding: '3px 8px', borderBottom: '1px solid #e8e8e8' }}>{line.memo || line.description || ''}</td>
              <td style={{ padding: '3px 8px', borderBottom: '1px solid #e8e8e8', textAlign: 'right' }}>${fmt(parseFloat(line.amount) || 0)}</td>
            </tr>
          ))}
          <tr style={{ fontWeight: 700 }}>
            <td colSpan={2} style={{ textAlign: 'right', padding: '5px 8px', borderTop: '1px solid #333' }}>Total</td>
            <td style={{ textAlign: 'right', padding: '5px 8px', borderTop: '1px solid #333' }}>${fmt(lineTotal)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )

  return (
    <div style={{ fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif", color: '#222', fontSize: 13 }}>

      {/* ── Check Face ── */}
      <div style={{ position: 'relative', padding: '36px 48px 28px', borderBottom: '2px dashed #999', minHeight: 280 }}>
        {/* Company info top-left */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 24 }}>
          {logoUrl && (
            <img src={logoUrl} alt="Logo" style={{ maxWidth: 56, maxHeight: 56, objectFit: 'contain', borderRadius: 4 }} />
          )}
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#336699' }}>{company.name || ''}</div>
            {company.address && <div style={{ fontSize: 10, color: '#555', whiteSpace: 'pre-line' }}>{company.address}</div>}
            {company.phone && <div style={{ fontSize: 10, color: '#555' }}>{company.phone}</div>}
          </div>
        </div>

        {/* Check number top-right */}
        <div style={{ position: 'absolute', top: 36, right: 48, fontSize: 12, fontWeight: 600, color: '#555' }}>
          #{check.number || 'To Print'}
        </div>

        {/* Date */}
        <div style={{ textAlign: 'right', marginBottom: 12 }}>
          <span style={{ fontSize: 10, color: '#888', marginRight: 8 }}>Date:</span>
          <span style={{ fontSize: 13, fontWeight: 500, borderBottom: '1px solid #ccc', paddingBottom: 2, display: 'inline-block', minWidth: 120, textAlign: 'center' }}>
            {check.date}
          </span>
        </div>

        {/* Pay to the order of */}
        <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 8 }}>
          <span style={{ fontSize: 9, textTransform: 'uppercase', color: '#888', marginRight: 8, whiteSpace: 'nowrap' }}>Pay to the Order of</span>
          <span style={{ flex: 1, fontSize: 14, fontWeight: 600, borderBottom: '1px solid #ccc', paddingBottom: 2 }}>
            {check.payee}
          </span>
          <span style={{ marginLeft: 16, fontSize: 14, fontWeight: 700, border: '1px solid #333', padding: '2px 12px', whiteSpace: 'nowrap' }}>
            ${fmt(check.amount)}
          </span>
        </div>

        {/* Amount in words */}
        <div style={{ fontSize: 12, borderBottom: '1px solid #ccc', paddingBottom: 4, marginBottom: 16, minHeight: 18, color: '#444' }}>
          {check.amount_words ? `${check.amount_words} *****` : ''}
        </div>

        {/* Address */}
        {check.address && (
          <div style={{ fontSize: 11, color: '#555', whiteSpace: 'pre-line', marginBottom: 16 }}>
            {check.address}
          </div>
        )}

        {/* Memo & Signature */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 20 }}>
          <div>
            <span style={{ fontSize: 10, color: '#888' }}>Memo: </span>
            <span style={{ fontSize: 12, borderBottom: '1px solid #ccc', display: 'inline-block', minWidth: 200, paddingBottom: 2 }}>
              {check.memo || ''}
            </span>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ borderBottom: '1px solid #333', width: 200, marginBottom: 4 }}>&nbsp;</div>
            <div style={{ fontSize: 9, color: '#888', textTransform: 'uppercase' }}>Authorized Signature</div>
          </div>
        </div>
      </div>

      {/* ── Voucher Stub 1 ── */}
      <VoucherStub />

      {/* ── Voucher Stub 2 ── */}
      <VoucherStub />
    </div>
  )
}
