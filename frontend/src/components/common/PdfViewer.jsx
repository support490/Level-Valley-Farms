import { useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { X, ChevronLeft, ChevronRight, Printer, Download } from 'lucide-react'
import 'react-pdf/dist/esm/Page/AnnotationLayer.css'
import 'react-pdf/dist/esm/Page/TextLayer.css'

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

export default function PdfViewer({ url, title = 'Document', onClose }) {
  const [numPages, setNumPages] = useState(null)
  const [pageNumber, setPageNumber] = useState(1)

  const onLoadSuccess = ({ numPages }) => {
    setNumPages(numPages)
  }

  const handlePrint = () => {
    const printWindow = window.open(url, '_blank')
    if (printWindow) {
      printWindow.addEventListener('load', () => printWindow.print())
    }
  }

  const handleDownload = async () => {
    const res = await fetch(url)
    const blob = await res.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${title}.pdf`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-700">
        <h3 className="text-white text-sm font-medium">{title}</h3>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-slate-300 text-sm">
            <button onClick={() => setPageNumber(p => Math.max(1, p - 1))}
              disabled={pageNumber <= 1}
              className="p-1 hover:bg-slate-700 rounded disabled:opacity-30">
              <ChevronLeft size={16} />
            </button>
            <span>{pageNumber} / {numPages || '?'}</span>
            <button onClick={() => setPageNumber(p => Math.min(numPages || p, p + 1))}
              disabled={pageNumber >= numPages}
              className="p-1 hover:bg-slate-700 rounded disabled:opacity-30">
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="h-4 w-px bg-slate-600 mx-1" />
          <button onClick={handlePrint} className="p-1.5 text-slate-300 hover:bg-slate-700 rounded" title="Print">
            <Printer size={16} />
          </button>
          <button onClick={handleDownload} className="p-1.5 text-slate-300 hover:bg-slate-700 rounded" title="Download">
            <Download size={16} />
          </button>
          <div className="h-4 w-px bg-slate-600 mx-1" />
          <button onClick={onClose} className="p-1.5 text-slate-300 hover:bg-slate-700 rounded" title="Close">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* PDF Content */}
      <div className="flex-1 overflow-auto flex justify-center py-4">
        <Document file={url} onLoadSuccess={onLoadSuccess}
          loading={<div className="text-slate-400 mt-20">Loading PDF...</div>}
          error={<div className="text-red-400 mt-20">Failed to load PDF.</div>}>
          <Page pageNumber={pageNumber} width={800} />
        </Document>
      </div>
    </div>
  )
}
