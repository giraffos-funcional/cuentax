CREATE TYPE "public"."ambiente_sii" AS ENUM('certificacion', 'produccion');--> statement-breakpoint
CREATE TYPE "public"."cotizacion_status" AS ENUM('borrador', 'enviada', 'aceptada', 'rechazada', 'expirada', 'convertida');--> statement-breakpoint
CREATE TYPE "public"."dte_status" AS ENUM('borrador', 'firmado', 'enviado', 'aceptado', 'rechazado', 'anulado');--> statement-breakpoint
CREATE TYPE "public"."forma_pago" AS ENUM('contado', 'credito', '30dias', '60dias');--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"name" text NOT NULL,
	"key_hash" text NOT NULL,
	"key_prefix" varchar(10),
	"scopes" text[] DEFAULT '{}',
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"activo" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer,
	"user_id" integer,
	"action" text NOT NULL,
	"resource" text,
	"resource_id" integer,
	"ip" text,
	"user_agent" text,
	"payload_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "caf_configs" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"tipo_dte" integer NOT NULL,
	"folio_desde" integer NOT NULL,
	"folio_hasta" integer NOT NULL,
	"folio_actual" integer NOT NULL,
	"fecha_autorizacion" text,
	"activo" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" serial PRIMARY KEY NOT NULL,
	"odoo_company_id" integer,
	"rut" varchar(15) NOT NULL,
	"razon_social" text NOT NULL,
	"giro" text NOT NULL,
	"actividad_economica" integer DEFAULT 620200,
	"direccion" text,
	"comuna" varchar(50),
	"ciudad" varchar(50) DEFAULT 'Santiago',
	"email" text,
	"telefono" varchar(20),
	"ambiente_sii" "ambiente_sii" DEFAULT 'certificacion',
	"cert_vence" timestamp with time zone,
	"cert_cargado" boolean DEFAULT false,
	"plan" varchar(20) DEFAULT 'starter',
	"activo" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "companies_odoo_company_id_unique" UNIQUE("odoo_company_id"),
	CONSTRAINT "companies_rut_unique" UNIQUE("rut")
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"rut" varchar(15) NOT NULL,
	"razon_social" text NOT NULL,
	"giro" text,
	"email" text,
	"telefono" varchar(20),
	"direccion" text,
	"comuna" varchar(50),
	"es_proveedor" boolean DEFAULT false,
	"es_cliente" boolean DEFAULT true,
	"activo" boolean DEFAULT true,
	"notas" text,
	"odoo_partner_id" integer,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "dte_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"tipo_dte" integer NOT NULL,
	"folio" integer,
	"track_id" varchar(50),
	"estado" "dte_status" DEFAULT 'borrador',
	"rut_receptor" varchar(15) NOT NULL,
	"razon_social_receptor" text NOT NULL,
	"giro_receptor" text,
	"email_receptor" text,
	"monto_neto" bigint DEFAULT 0,
	"monto_exento" bigint DEFAULT 0,
	"monto_iva" bigint DEFAULT 0,
	"monto_total" bigint NOT NULL,
	"fecha_emision" text NOT NULL,
	"fecha_vencimiento" text,
	"xml_firmado_b64" text,
	"pdf_url" text,
	"ref_tipo_doc" integer,
	"ref_folio" integer,
	"ref_motivo" text,
	"items_json" jsonb,
	"observaciones" text,
	"odoo_move_id" integer,
	"cotizacion_id" integer,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"codigo" varchar(50),
	"nombre" text NOT NULL,
	"descripcion" text,
	"precio" bigint NOT NULL,
	"precio_con_iva" bigint,
	"unidad" varchar(20) DEFAULT 'UN',
	"exento" boolean DEFAULT false,
	"activo" boolean DEFAULT true,
	"categoria" text,
	"odoo_product_id" integer,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "quotations" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"numero" integer NOT NULL,
	"estado" "cotizacion_status" DEFAULT 'borrador',
	"rut_receptor" varchar(15) NOT NULL,
	"razon_social_receptor" text NOT NULL,
	"giro_receptor" text,
	"email_receptor" text,
	"fecha" text NOT NULL,
	"valida_hasta" text NOT NULL,
	"monto_total" bigint NOT NULL,
	"items_json" jsonb NOT NULL,
	"observaciones" text,
	"dte_id" integer,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "webhook_endpoints" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"url" text NOT NULL,
	"secret_hash" text NOT NULL,
	"events" text[] NOT NULL,
	"activo" boolean DEFAULT true,
	"failure_count" integer DEFAULT 0,
	"last_triggered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caf_configs" ADD CONSTRAINT "caf_configs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dte_documents" ADD CONSTRAINT "dte_documents_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_company_time_idx" ON "audit_log" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_action_idx" ON "audit_log" USING btree ("action");--> statement-breakpoint
CREATE UNIQUE INDEX "caf_company_tipo_idx" ON "caf_configs" USING btree ("company_id","tipo_dte");--> statement-breakpoint
CREATE UNIQUE INDEX "companies_rut_idx" ON "companies" USING btree ("rut");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_rut_company_idx" ON "contacts" USING btree ("company_id","rut");--> statement-breakpoint
CREATE INDEX "contact_names_idx" ON "contacts" USING btree ("razon_social");--> statement-breakpoint
CREATE INDEX "dte_company_idx" ON "dte_documents" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "dte_track_id_idx" ON "dte_documents" USING btree ("track_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dte_folio_company_idx" ON "dte_documents" USING btree ("company_id","tipo_dte","folio");--> statement-breakpoint
CREATE INDEX "dte_fecha_idx" ON "dte_documents" USING btree ("fecha_emision");--> statement-breakpoint
CREATE INDEX "dte_estado_idx" ON "dte_documents" USING btree ("estado");--> statement-breakpoint
CREATE INDEX "product_company_codigo_idx" ON "products" USING btree ("company_id","codigo");--> statement-breakpoint
CREATE INDEX "product_names_idx" ON "products" USING btree ("nombre");--> statement-breakpoint
CREATE UNIQUE INDEX "quotation_company_num_idx" ON "quotations" USING btree ("company_id","numero");