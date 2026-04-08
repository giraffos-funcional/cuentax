/**
 * CUENTAX — Portal del Trabajador: Mi Perfil
 * Displays the employee's profile information.
 */

'use client'

import { usePortalProfile } from '@/hooks/use-portal'
import {
  User,
  Mail,
  Phone,
  Briefcase,
  Building2,
  Calendar,
  Shield,
  Heart,
  Loader2,
  AlertCircle,
} from 'lucide-react'

// ── Date formatter ────────────────────────────────────────────
function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-'
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ── Health plan display ───────────────────────────────────────
function healthPlanLabel(healthPlan: string, isapre: string): string {
  if (healthPlan === 'fonasa' || healthPlan === 'Fonasa') return 'Fonasa'
  if (isapre) return `Isapre — ${isapre}`
  return healthPlan || '-'
}

export default function PortalPerfilPage() {
  const { profile, isLoading, error } = usePortalProfile()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={24} className="animate-spin text-violet-500" />
        <span className="ml-2 text-sm text-slate-500">Cargando perfil...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 p-4 rounded-xl bg-red-50 border border-red-200">
        <AlertCircle size={16} className="text-red-500" />
        <span className="text-sm text-red-600">Error al cargar la informacion del perfil</span>
      </div>
    )
  }

  if (!profile) return null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-slate-800">Mi Perfil</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Informacion personal y de prevision
        </p>
      </div>

      {/* Avatar + Name card */}
      <div className="bg-white border border-[var(--cx-border)] rounded-xl overflow-hidden">
        <div className="px-5 py-5 flex items-center gap-4">
          {profile.image_128 ? (
            <img
              src={`data:image/png;base64,${profile.image_128}`}
              alt={profile.name}
              className="w-16 h-16 rounded-full object-cover border-2 border-violet-100"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-violet-50 border-2 border-violet-100 flex items-center justify-center">
              <User size={28} className="text-violet-400" />
            </div>
          )}
          <div>
            <p className="text-lg font-semibold text-slate-800">{profile.name}</p>
            <p className="text-sm text-slate-500">{profile.job_title || '-'}</p>
            {profile.company_name && (
              <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                <Building2 size={11} className="text-slate-400" />
                {profile.company_name}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Info grid */}
      <div className="bg-white border border-[var(--cx-border)] rounded-xl overflow-hidden">
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* Datos Personales */}
          <div className="space-y-4">
            <h2 className="text-xs font-semibold text-violet-700 uppercase tracking-wider">Datos Personales</h2>
            <div>
              <label className="text-[11px] text-slate-400 uppercase tracking-wider font-medium">Nombre Completo</label>
              <p className="text-sm text-slate-800 mt-0.5 flex items-center gap-1.5">
                <User size={13} className="text-slate-400" />
                {profile.name}
              </p>
            </div>
            <div>
              <label className="text-[11px] text-slate-400 uppercase tracking-wider font-medium">RUT</label>
              <p className="text-sm text-slate-800 mt-0.5">{profile.rut || '-'}</p>
            </div>
            <div>
              <label className="text-[11px] text-slate-400 uppercase tracking-wider font-medium">Cargo</label>
              <p className="text-sm text-slate-800 mt-0.5 flex items-center gap-1.5">
                <Briefcase size={13} className="text-slate-400" />
                {profile.job_title || '-'}
              </p>
            </div>
            <div>
              <label className="text-[11px] text-slate-400 uppercase tracking-wider font-medium">Departamento</label>
              <p className="text-sm text-slate-800 mt-0.5 flex items-center gap-1.5">
                <Building2 size={13} className="text-slate-400" />
                {profile.department || '-'}
              </p>
            </div>
          </div>

          {/* Contacto */}
          <div className="space-y-4">
            <h2 className="text-xs font-semibold text-violet-700 uppercase tracking-wider">Contacto</h2>
            <div>
              <label className="text-[11px] text-slate-400 uppercase tracking-wider font-medium">Email Laboral</label>
              <p className="text-sm text-slate-800 mt-0.5 flex items-center gap-1.5">
                <Mail size={13} className="text-slate-400" />
                {profile.work_email || '-'}
              </p>
            </div>
            <div>
              <label className="text-[11px] text-slate-400 uppercase tracking-wider font-medium">Telefono Laboral</label>
              <p className="text-sm text-slate-800 mt-0.5 flex items-center gap-1.5">
                <Phone size={13} className="text-slate-400" />
                {profile.work_phone || '-'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Contrato + Prevision */}
      <div className="bg-white border border-[var(--cx-border)] rounded-xl overflow-hidden">
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* Contrato */}
          <div className="space-y-4">
            <h2 className="text-xs font-semibold text-violet-700 uppercase tracking-wider">Contrato</h2>
            <div>
              <label className="text-[11px] text-slate-400 uppercase tracking-wider font-medium">Fecha de Ingreso</label>
              <p className="text-sm text-slate-800 mt-0.5 flex items-center gap-1.5">
                <Calendar size={13} className="text-slate-400" />
                {formatDate(profile.date_start)}
              </p>
            </div>
            <div>
              <label className="text-[11px] text-slate-400 uppercase tracking-wider font-medium">Empresa</label>
              <p className="text-sm text-slate-800 mt-0.5 flex items-center gap-1.5">
                <Building2 size={13} className="text-slate-400" />
                {profile.company_name || '-'}
              </p>
            </div>
          </div>

          {/* Prevision */}
          <div className="space-y-4">
            <h2 className="text-xs font-semibold text-violet-700 uppercase tracking-wider">Prevision</h2>
            <div>
              <label className="text-[11px] text-slate-400 uppercase tracking-wider font-medium">AFP</label>
              <p className="text-sm text-slate-800 mt-0.5 flex items-center gap-1.5">
                <Shield size={13} className="text-slate-400" />
                {profile.afp || '-'}
              </p>
            </div>
            <div>
              <label className="text-[11px] text-slate-400 uppercase tracking-wider font-medium">Salud</label>
              <p className="text-sm text-slate-800 mt-0.5 flex items-center gap-1.5">
                <Heart size={13} className="text-slate-400" />
                {healthPlanLabel(profile.health_plan, profile.isapre)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
