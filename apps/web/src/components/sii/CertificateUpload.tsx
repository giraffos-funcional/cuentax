'use client'

import React, { useState, useRef } from 'react'
import {
  Shield, Upload, CheckCircle2, AlertTriangle,
  Eye, EyeOff, FileKey2, ChevronRight,
  Lock, Info, Loader2, Link2
} from 'lucide-react'
import { useCertificateList, useSIIStatus } from '@/hooks'
import { apiClient } from '@/lib/api-client'

export function CertificateUploader({ onSuccess }: { onSuccess: () => void }) {
  const [dragging, setDragging] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = (f: File) => {
    if (!f.name.match(/\.(pfx|p12)$/i)) {
      setError('Solo se aceptan archivos .pfx o .p12')
      return
    }
    setFile(f)
    setError(null)
  }

  const handleSubmit = async () => {
    if (!file || !password) return
    setLoading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('password', password)

      await apiClient.post('/api/v1/sii/certificate/load', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })

      onSuccess()
    } catch (e: any) {
      const msg = e.response?.data?.message ?? e.message ?? 'Error desconocido'
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Drop Zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f) }}
        onClick={() => inputRef.current?.click()}
        className={`
          relative flex flex-col items-center justify-center
          border-2 border-dashed rounded-2xl p-8 cursor-pointer
          transition-all duration-200
          ${dragging
            ? 'border-violet-400 bg-[var(--cx-active-bg)]'
            : file
              ? 'border-[var(--cx-status-ok-border)] bg-[var(--cx-status-ok-bg)]'
              : 'border-[var(--cx-border-hover)] hover:border-[var(--cx-active-border)] hover:bg-[var(--cx-active-bg)] bg-[var(--cx-bg-elevated)]'
          }
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pfx,.p12"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
        />

        {file ? (
          <>
            <FileKey2 size={28} className="text-[var(--cx-status-ok-text)] mb-3" />
            <p className="text-sm font-semibold text-[var(--cx-status-ok-text)]">{file.name}</p>
            <p className="text-xs text-[var(--cx-text-secondary)] mt-1">{(file.size / 1024).toFixed(1)} KB — Haz clic para cambiar</p>
          </>
        ) : (
          <>
            <Upload size={24} className="text-[var(--cx-text-secondary)] mb-3" />
            <p className="text-sm font-medium text-[var(--cx-text-primary)]">Arrastra tu certificado aquí</p>
            <p className="text-xs text-[var(--cx-text-muted)] mt-1">Archivos .pfx o .p12</p>
          </>
        )}
      </div>

      {/* Password */}
      <div>
        <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-2">
          Contraseña del certificado
        </label>
        <div className="relative">
          <Lock size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--cx-text-muted)]" />
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Contraseña PFX..."
            className="input-field pl-9 pr-9"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--cx-text-secondary)] hover:text-[var(--cx-text-primary)] transition-colors"
          >
            {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
        </div>
        <div className="flex items-center gap-1.5 mt-2 text-[11px] text-[var(--cx-text-muted)]">
          <Info size={10} />
          El certificado se carga en memoria del servidor. No se almacena en disco.
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
          <AlertTriangle size={13} />
          {error}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={!file || !password || loading}
        className="btn-primary w-full justify-center"
      >
        {loading ? (
          <><Loader2 size={14} className="animate-spin" /> Cargando certificado...</>
        ) : (
          <><Shield size={14} /> Cargar Certificado</>
        )}
      </button>
    </div>
  )
}

export function CertificateStep({ onSuccess }: { onSuccess: () => void }) {
  const { certificates, isLoading: listLoading, associateCertificate } = useCertificateList()
  const { cert, mutateCert } = useSIIStatus()
  const [associating, setAssociating] = useState(false)
  const [associateError, setAssociateError] = useState<string | null>(null)
  const [showUploadForm, setShowUploadForm] = useState(false)

  // If cert is already associated with this company, skip to success
  const certAlreadyAssociated = cert.cargado

  // Find a loaded cert that is NOT yet associated with the current company
  const availableCert = certificates.length > 0 && !certAlreadyAssociated
    ? certificates[0]
    : null

  const handleAssociate = async () => {
    setAssociating(true)
    setAssociateError(null)
    try {
      await associateCertificate()
      if (mutateCert) mutateCert()
      onSuccess()
    } catch (e: unknown) {
      setAssociateError(e instanceof Error ? e.message : 'Error asociando certificado')
    } finally {
      setAssociating(false)
    }
  }

  if (listLoading) {
    return (
      <div className="animate-fade-in space-y-4">
        <h3 className="text-sm font-semibold text-slate-800">Certificado Digital PFX</h3>
        <div className="flex items-center justify-center py-8 text-slate-400">
          <Loader2 size={20} className="animate-spin mr-2" />
          <span className="text-sm">Verificando certificados...</span>
        </div>
      </div>
    )
  }

  // If cert is already loaded and associated with this company
  if (certAlreadyAssociated) {
    return (
      <div className="animate-fade-in space-y-4">
        <h3 className="text-sm font-semibold text-slate-800">Certificado Digital PFX</h3>
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-700 flex items-center gap-3">
          <CheckCircle2 size={16} />
          <div>
            <p className="font-semibold">Certificado cargado</p>
            <p className="text-xs text-emerald-600 mt-0.5">
              Vence: {cert.vence ?? 'N/A'}
              {cert.diasParaVencer != null && ` (${cert.diasParaVencer} dias restantes)`}
            </p>
          </div>
        </div>
        <button onClick={onSuccess} className="btn-primary w-full justify-center">
          Continuar <ChevronRight size={14} />
        </button>
      </div>
    )
  }

  return (
    <div className="animate-fade-in space-y-4">
      <h3 className="text-sm font-semibold text-slate-800">Certificado Digital PFX</h3>

      {/* Existing cert available for association */}
      {availableCert && !showUploadForm && (
        <div className="space-y-3">
          <div className="p-4 rounded-xl bg-violet-50 border border-violet-200">
            <div className="flex items-center gap-2 mb-2">
              <FileKey2 size={14} className="text-violet-600" />
              <p className="text-sm font-semibold text-violet-800">Certificado disponible</p>
            </div>
            <p className="text-xs text-violet-700">
              Certificado de <span className="font-bold">{availableCert.nombre_titular}</span> ({availableCert.rut_titular}) ya esta cargado.
              Puedes usarlo para esta empresa.
            </p>
            <p className="text-[10px] text-violet-500 mt-1">
              Vence: {availableCert.vence} ({availableCert.dias_para_vencer} dias restantes)
            </p>
          </div>

          {associateError && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
              <AlertTriangle size={13} />
              {associateError}
            </div>
          )}

          <button
            onClick={handleAssociate}
            disabled={associating}
            className="btn-primary w-full justify-center"
          >
            {associating ? (
              <><Loader2 size={14} className="animate-spin" /> Asociando certificado...</>
            ) : (
              <><Link2 size={14} /> Usar este certificado</>
            )}
          </button>

          <div className="relative flex items-center gap-3 py-1">
            <div className="flex-1 h-px bg-slate-200" />
            <span className="text-[10px] text-slate-400 uppercase tracking-wide">O cargar un nuevo certificado</span>
            <div className="flex-1 h-px bg-slate-200" />
          </div>

          <button
            onClick={() => setShowUploadForm(true)}
            className="w-full text-xs text-slate-500 hover:text-violet-600 transition-colors py-2 flex items-center justify-center gap-1.5"
          >
            <Upload size={12} />
            Cargar nuevo certificado .pfx
          </button>
        </div>
      )}

      {/* Upload form: shown when no cert available OR user clicked "cargar nuevo" */}
      {(!availableCert || showUploadForm) && (
        <CertificateUploader onSuccess={() => {
          onSuccess()
        }} />
      )}
    </div>
  )
}
