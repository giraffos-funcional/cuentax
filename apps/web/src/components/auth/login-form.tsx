'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, Eye, EyeOff, Building2 } from 'lucide-react'

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Contraseña requerida'),
  company_rut: z.string().optional(),
})

type LoginFormData = z.infer<typeof loginSchema>

export function LoginForm() {
  const [showPassword, setShowPassword] = useState(false)
  const [showRut, setShowRut] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  })

  const onSubmit = async (data: LoginFormData) => {
    // TODO Sprint 1: Conectar con BFF /api/v1/auth/login
    console.log('Login:', data)
    await new Promise((r) => setTimeout(r, 1000)) // Simulate
    setError('root', { message: 'Auth se implementa en Sprint 1' })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* Email */}
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1.5">
          Email
        </label>
        <input
          type="email"
          autoComplete="email"
          placeholder="nombre@empresa.cl"
          className="input-field"
          {...register('email')}
        />
        {errors.email && (
          <p className="mt-1 text-xs text-red-400">{errors.email.message}</p>
        )}
      </div>

      {/* Password */}
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1.5">
          Contraseña
        </label>
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
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors"
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        {errors.password && (
          <p className="mt-1 text-xs text-red-400">{errors.password.message}</p>
        )}
      </div>

      {/* RUT Empresa (opcional) */}
      <div>
        <button
          type="button"
          onClick={() => setShowRut(!showRut)}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-cyan-400 transition-colors"
        >
          <Building2 size={12} />
          {showRut ? 'Ocultar' : 'Especificar empresa (RUT)'}
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
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
          {errors.root.message}
        </div>
      )}

      {/* Submit */}
      <button type="submit" disabled={isSubmitting} className="btn-primary w-full justify-center mt-2">
        {isSubmitting ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Ingresando...
          </>
        ) : (
          'Ingresar'
        )}
      </button>
    </form>
  )
}
