-- CUENTAX — Crea el usuario de Odoo en PostgreSQL
-- Odoo necesita su propio usuario con permisos

CREATE USER odoo WITH PASSWORD 'cuentax_odoo' CREATEDB;
CREATE DATABASE cuentax_odoo OWNER odoo;
GRANT ALL PRIVILEGES ON DATABASE cuentax_odoo TO odoo;
