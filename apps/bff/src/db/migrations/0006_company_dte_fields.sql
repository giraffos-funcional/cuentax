-- Migration 0006: Company DTE / SII Resolution fields
-- Extiende `companies` con todos los campos requeridos para emisión DTE
-- (giro, tipo de contribuyente, actividades económicas, datos de resolución SII).

-- ── Enum: tipo de contribuyente ───────────────────────────────
DO $$ BEGIN
  CREATE TYPE "tipo_contribuyente" AS ENUM (
    'iva_afecto_1a',
    'iva_afecto_2a',
    'exento',
    'pequeno_contribuyente'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── Columnas nuevas en companies ──────────────────────────────
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "region"                varchar(60);
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "movil"                 varchar(20);
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "sitio_web"             text;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "tipo_contribuyente"    "tipo_contribuyente";
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "actividades_economicas" integer[];
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "correo_dte"            text;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "oficina_regional_sii"  varchar(60);
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "numero_resolucion_sii" integer;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "fecha_resolucion_sii"  date;
