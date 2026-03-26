-- CUENTAX — PostgreSQL Init Script
-- Crea la base de datos, usuario y extensiones necesarias.

-- Extensiones útiles
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";   -- Para búsqueda fuzzy de texto
CREATE EXTENSION IF NOT EXISTS "unaccent";   -- Para búsqueda sin tildes

-- Función para updated_at automático
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- El schema lo crea Drizzle con: pnpm drizzle-kit migrate
