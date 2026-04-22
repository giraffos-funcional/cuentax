/**
 * CUENTAX — Keyword Templates for Cost Centers
 * ================================================
 * Prebuilt keyword sets by business vertical. Users can pick a template when
 * creating a new cost center to get a sensible starting set of keywords.
 */

export interface KeywordTemplate {
  id: string
  name: string
  name_es: string
  description: string
  description_es: string
  default_plan: string
  default_plan_es: string
  suggested_keywords: string[]
  example_centers: Array<{ name: string; keywords: string[] }>
}

export const KEYWORD_TEMPLATES: KeywordTemplate[] = [
  {
    id: 'airbnb',
    name: 'Airbnb / Short-term rentals',
    name_es: 'Airbnb / Arriendos cortos',
    description: 'One cost center per property. Tags cleaning, HOA, utilities, maintenance.',
    description_es: 'Un centro de costo por propiedad. Taggea limpieza, gastos comunes, servicios, mantención.',
    default_plan: 'Properties',
    default_plan_es: 'Propiedades',
    suggested_keywords: [
      'HOA', 'CLEANING', 'AIRBNB PAYOUT', 'GUESTY', 'SUPERHOG',
      'GASTOS COMUNES', 'GC', 'LIMPIEZA', 'MANTENCION',
    ],
    example_centers: [
      { name: 'Apto Providencia 101', keywords: ['PROV 101', 'PROVIDENCIA 101', 'LIMPIEZA 101'] },
      { name: 'Casa Reñaca', keywords: ['REÑACA', 'RENACA'] },
    ],
  },
  {
    id: 'construction',
    name: 'Construction / Project-based',
    name_es: 'Construcción / Por proyecto',
    description: 'One center per project / obra. Tags materials, labor, permits, subcontractors.',
    description_es: 'Un centro por proyecto/obra. Taggea materiales, mano de obra, permisos, subcontratos.',
    default_plan: 'Projects',
    default_plan_es: 'Proyectos',
    suggested_keywords: [
      'MATERIALS', 'LABOR', 'PERMIT', 'SUBCONTRACTOR',
      'MATERIALES', 'MANO DE OBRA', 'PERMISO', 'SUBCONTRATO',
      'SODIMAC', 'CONSTRUMART', 'EASY', 'HOME DEPOT', 'LOWES',
    ],
    example_centers: [
      { name: 'Obra Las Condes', keywords: ['LAS CONDES', 'LC FASE', 'OBRA LC'] },
    ],
  },
  {
    id: 'lawfirm',
    name: 'Law firm / Cases',
    name_es: 'Estudio jurídico / Por caso',
    description: 'One center per case or matter. Tags filing fees, expert witnesses, travel.',
    description_es: 'Un centro por caso. Taggea aranceles, peritos, viajes.',
    default_plan: 'Cases',
    default_plan_es: 'Casos',
    suggested_keywords: [
      'FILING FEE', 'COURT', 'EXPERT WITNESS', 'DEPOSITION',
      'ARANCEL', 'TRIBUNAL', 'PERITO', 'PODER JUDICIAL',
    ],
    example_centers: [
      { name: 'Caso Rol 1234-2026', keywords: ['ROL 1234', 'CASO ACME'] },
    ],
  },
  {
    id: 'retail',
    name: 'Retail / Multi-location',
    name_es: 'Retail / Multi-local',
    description: 'One center per store. Tags rent, salaries, utilities per location.',
    description_es: 'Un centro por local. Taggea arriendo, sueldos, servicios básicos por local.',
    default_plan: 'Stores',
    default_plan_es: 'Locales',
    suggested_keywords: [
      'RENT', 'LEASE', 'UTILITIES', 'POS', 'TRANSBANK',
      'ARRIENDO', 'SERVICIOS BASICOS', 'PUNTO DE VENTA',
    ],
    example_centers: [
      { name: 'Local Mall Parque Arauco', keywords: ['PARQUE ARAUCO', 'MALL PA', 'LOCAL PA'] },
    ],
  },
  {
    id: 'consulting',
    name: 'Consulting / Per client',
    name_es: 'Consultoría / Por cliente',
    description: 'One center per client engagement. Tags billable hours, travel, subcontractors.',
    description_es: 'Un centro por cliente. Taggea horas facturables, viajes, subcontratos.',
    default_plan: 'Clients',
    default_plan_es: 'Clientes',
    suggested_keywords: [
      'STRIPE', 'INVOICE', 'TRAVEL', 'AIRFARE', 'HOTEL',
      'FACTURA', 'VIAJE', 'PASAJE', 'HOTEL',
    ],
    example_centers: [
      { name: 'Cliente Alfa', keywords: ['ALFA CORP', 'PROYECTO ALFA'] },
    ],
  },
  {
    id: 'restaurant',
    name: 'Restaurant / Per location',
    name_es: 'Restaurante / Por local',
    description: 'One center per restaurant. Tags food cost, staff, rent, utilities.',
    description_es: 'Un centro por restaurante. Taggea insumos, personal, arriendo, luz/agua/gas.',
    default_plan: 'Restaurants',
    default_plan_es: 'Restaurantes',
    suggested_keywords: [
      'SYSCO', 'US FOODS', 'LIDER FOODSERVICE', 'ALIMENTOS',
      'GASTRONOMIA', 'PANADERIA', 'GAS', 'ENEL', 'LUZ',
    ],
    example_centers: [
      { name: 'Local Providencia', keywords: ['PROVIDENCIA LOCAL', 'REST PROV'] },
    ],
  },
  {
    id: 'ecommerce',
    name: 'E-commerce / Per channel or SKU',
    name_es: 'E-commerce / Por canal o SKU',
    description: 'One center per sales channel (Shopify, Amazon, MercadoLibre) or product family.',
    description_es: 'Un centro por canal de venta (Shopify, Amazon, MercadoLibre) o familia de productos.',
    default_plan: 'Sales Channels',
    default_plan_es: 'Canales de Venta',
    suggested_keywords: [
      'SHOPIFY', 'AMAZON', 'MERCADOLIBRE', 'ML', 'STRIPE',
      'FBA', 'AWS', 'LOGISTICS', 'SHIPPING', 'DESPACHO',
    ],
    example_centers: [
      { name: 'Canal Shopify', keywords: ['SHOPIFY PAYOUT', 'SHOPIFY PAYMENTS'] },
      { name: 'Canal MercadoLibre', keywords: ['MERCADO LIBRE', 'MERCADOPAGO', 'MELI'] },
    ],
  },
]
