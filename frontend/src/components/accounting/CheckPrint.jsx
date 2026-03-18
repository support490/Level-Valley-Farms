import numberToWords from '../../utils/numberToWords'

export default function CheckPrint({ check, onClose }) {
  const {
    check_number,
    check_date,
    payee_name,
    amount,
    address,
    memo,
    expense_lines = [],
  } = check || {}

  const formattedAmount =
    typeof amount === 'number'
      ? amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : '0.00'

  let amountWords = ''
  try {
    amountWords = typeof amount === 'number' && amount > 0 ? numberToWords(amount) : ''
  } catch {
    amountWords = ''
  }

  const lineTotal = expense_lines.reduce(
    (sum, l) => sum + (parseFloat(l.amount) || 0),
    0,
  )

  const handlePrint = () => {
    window.print()
  }

  // ── Voucher stub content (reused for both stubs) ──
  const VoucherStub = () => (
    <div className="qb-check-stub">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 8,
          fontSize: 11,
          fontWeight: 600,
        }}
      >
        <span>Check #{check_number || 'To Print'}</span>
        <span>{check_date}</span>
        <span>{payee_name}</span>
        <span>${formattedAmount}</span>
      </div>

      <table className="qb-stub-table">
        <thead>
          <tr>
            <th>Account</th>
            <th>Description</th>
            <th style={{ textAlign: 'right' }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {expense_lines.map((line, idx) => (
            <tr key={idx}>
              <td>{line.account_name || `Account ${line.account_id || ''}`}</td>
              <td>{line.memo || ''}</td>
              <td style={{ textAlign: 'right' }}>
                ${(parseFloat(line.amount) || 0).toFixed(2)}
              </td>
            </tr>
          ))}
          <tr style={{ fontWeight: 700 }}>
            <td colSpan={2} style={{ textAlign: 'right', borderTop: '1px solid black' }}>
              Total
            </td>
            <td style={{ textAlign: 'right', borderTop: '1px solid black' }}>
              ${lineTotal.toFixed(2)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        background: 'white',
        overflowY: 'auto',
      }}
    >
      {/* ── Controls (hidden during print) ── */}
      <div
        className="no-print"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 24px',
          borderBottom: '1px solid #ccc',
          background: '#f5f5f5',
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Print Check</h2>
        <div style={{ display: 'flex', gap: 8 }}>
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

      {/* ── Check content ── */}
      <div className="qb-check-print-page">
        {/* ── Check Face ── */}
        <div className="qb-check-face">
          {/* Check number */}
          <div style={{ position: 'absolute', top: '0.3in', right: '0.5in', fontSize: 11, fontWeight: 600 }}>
            #{check_number || 'To Print'}
          </div>

          {/* Date */}
          <div className="check-date">{check_date}</div>

          {/* Pay to the order of */}
          <div className="check-payee">
            <span style={{ fontSize: 9, marginRight: 8, textTransform: 'uppercase' }}>
              Pay to the Order of
            </span>
            {payee_name}
          </div>

          {/* Amount box */}
          <div className="check-amount-box">${formattedAmount}</div>

          {/* Amount in words */}
          <div className="check-amount-words">
            {amountWords ? `${amountWords} *****` : ''}
          </div>

          {/* Address */}
          {address && (
            <div style={{ marginTop: '0.2in', fontSize: 10, whiteSpace: 'pre-line' }}>
              {address}
            </div>
          )}

          {/* Memo */}
          <div className="check-memo">Memo: {memo || ''}</div>

          {/* Signature line */}
          <div className="check-signature-line">Authorized Signature</div>
        </div>

        {/* ── Voucher Stub 1 ── */}
        <VoucherStub />

        {/* ── Voucher Stub 2 ── */}
        <VoucherStub />
      </div>
    </div>
  )
}
