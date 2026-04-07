/**
 * CUENTAX — Portal del Trabajador: Documentos
 * Request and download employment documents.
 */

'use client'

import { useState } from 'react'
import { downloadCertificadoLaboral } from '@/hooks/use-portal'
import {
  FileText, Download, Loader2, Award,
  CheckCircle, AlertCircle,
} from 'lucide-react'

// ── Document types available ─────────────────────────────────────
interface DocumentType {
  id: string
  title: string
  description: string
  icon: typeof FileText
  downloadFn: () => Promise<void>
}

const DOCUMENT_TYPES: DocumentType[] = [
  {
    id: 'certificado-laboral',
    title: 'Certificado Laboral',
    description: 'Indica cargo, antigüedad, tipo de contrato y remuneración bruta. Útil para trámites bancarios, arriendo, y otros.',
    icon: Award,
    downloadFn: downloadCertificadoLaboral,
  },
]

export default function PortalDocumentosPage() {
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [successId, setSuccessId] = useState<string | null>(null)
  const [errorId, setErrorId] = useState<string | null>(null)

  const handleDownload = async (doc: DocumentType) => {
    setLoadingId(doc.id)
    setSuccessId(null)
    setErrorId(null)

    try {
      await doc.downloadFn()
      setSuccessId(doc.id)
      setTimeout(() => setSuccessId(null), 3000)
    } catch {
      setErrorId(doc.id)
      setTimeout(() => setErrorId(null), 4000)
    } finally {
      setLoadingId(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-slate-800">Documentos</h1>
        <p className="text-sm text-slate-500 mt-1">
          Solicita y descarga documentos laborales generados automáticamente.
        </p>
      </div>

      {/* Document cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {DOCUMENT_TYPES.map((doc) => {
          const isLoading = loadingId === doc.id
          const isSuccess = successId === doc.id
          const isError = errorId === doc.id

          return (
            <div
              key={doc.id}
              className="bg-white border border-[var(--cx-border)] rounded-xl p-5 flex flex-col gap-4"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-violet-50 flex items-center justify-center flex-shrink-0">
                  <doc.icon size={20} className="text-violet-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-slate-800">{doc.title}</h3>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    {doc.description}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleDownload(doc)}
                  disabled={isLoading}
                  className="btn-primary text-xs"
                >
                  {isLoading ? (
                    <><Loader2 size={13} className="animate-spin" /> Generando...</>
                  ) : (
                    <><Download size={13} /> Descargar PDF</>
                  )}
                </button>

                {isSuccess && (
                  <span className="flex items-center gap-1 text-xs text-emerald-600">
                    <CheckCircle size={13} /> Descargado
                  </span>
                )}
                {isError && (
                  <span className="flex items-center gap-1 text-xs text-red-500">
                    <AlertCircle size={13} /> Error al generar
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Info note */}
      <div className="flex items-start gap-2.5 p-4 rounded-xl bg-slate-50 border border-[var(--cx-border)]">
        <FileText size={16} className="text-slate-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-slate-500 leading-relaxed">
          Los documentos se generan con la información vigente al momento de la descarga.
          Si necesitas un documento que no aparece aquí, contacta a Recursos Humanos.
        </p>
      </div>
    </div>
  )
}
