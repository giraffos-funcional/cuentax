'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useRouter } from 'next/navigation'
import { Loader2, Eye, EyeOff, Building2, AlertCircle } from 'lucide-react'
import { apiClient } from '@/lib/api-client'
import { useAuthStore } from '@/stores/auth.store'

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Contraseña requerida'),
  company_rut: z.string().optional(),
})

type LoginFormData = z.infer<typeof loginSchema>

export function LoginForm() {
  const [showPassword, setShowPassword] = useState(false)
  const [showRut, setShowRut] = useState(false)
  const router = useRouter()
  const setAuth = useAuthStore((s) => s.setAuth)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<LoginFormData>({ resolver: zodResolver(loginSchema) })

  const onSubmit = async (data: LoginFormData) => {
    try {
      const res = await apiClient.post('/api/v1/auth/login', data)
      const { access_token, user } = res.data

      setAuth(user, access_token)
      router.push('/dashboard')
    } catch (err: unknown) {
      const msg =
        (err as any)?.response?.data?.message ??
        'Error al iniciar sesión. Verifica tus credenciales.'
      setError('root', { message: msg })
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* Email */}
      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1.5">Email</label>
        <input
          type="email"
          autoComplete="email"
          placeholder="nombre@empresa.cl"
          className="input-field"
          {...register('email')}
        />
        {errors.email && <p className="mt-1 text-xs text-red-400">{errors.email.message}</p>}
      </div>

      {/* Password */}
      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1.5">Contraseña</label>
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="••••••••"
            className="input-field pr-10"
            {...register('password')}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-200 transition-colors"
          >
            {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
        {errors.password && <p className="mt-1 text-xs text-red-400">{errors.password.message}</p>}
      </div>

      {/* RUT empresa — Multi-tenant */}
      <div>
        <button
          type="button"
          onClick={() => setShowRut(!showRut)}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-violet-400 transition-colors"
        >
          <Building2 size={12} />
          {showRut ? 'Ocultar empresa' : 'Ingresar como empresa específica (RUT)'}
        </button>
        {showRut && (
          <div className="mt-2">
            <input
              type="text"
              placeholder="12.345.678-9"
              className="input-field"
              {...register('company_rut')}
            />
          </div>
        )}
      </div>

      {/* Error global */}
      {errors.root && (
        <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20">
          <AlertCircle size={14} className="text-red-400 shrink-0 mt-0.5" />
          <p className="text-xs text-red-400">{errors.root.message}</p>
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={isSubmitting}
        className="btn-primary w-full justify-center mt-2"
        style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}
      >
        {isSubmitting ? (
          <><Loader2 size={14} className="animate-spin" /> Ingresando...</>
        ) : (
          'Ingresar'
        )}
      </button>

      <p className="text-center text-xs text-slate-600">
        ¿Problemas para acceder?{' '}
        <a href="#" className="text-violet-400 hover:text-violet-300 transition-colors">
          Contactar soporte
        </a>
      </p>
    </form>
  )
}
