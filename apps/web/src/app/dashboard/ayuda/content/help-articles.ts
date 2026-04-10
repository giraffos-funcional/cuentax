/**
 * CUENTAX — Help Center: Article Content
 * All help articles with real, detailed content for Chilean accounting context.
 */

export interface HelpArticleSection {
  title: string
  content: string
  tip?: string
  warning?: string
}

export interface HelpArticle {
  slug: string
  title: string
  category: string
  categoryLabel: string
  icon: string
  summary: string
  keywords: string[]
  sections: HelpArticleSection[]
  relatedSlugs?: string[]
}

export interface HelpCategory {
  key: string
  label: string
  icon: string
  description: string
}

export const HELP_CATEGORIES: HelpCategory[] = [
  { key: 'primeros-pasos', label: 'Primeros Pasos', icon: 'BookOpen', description: 'Configura tu cuenta y emite tu primer documento' },
  { key: 'emision', label: 'Emisión de Documentos', icon: 'FileText', description: 'Facturas, boletas, notas de crédito y más' },
  { key: 'gastos', label: 'Gastos y OCR', icon: 'Camera', description: 'Escanea y registra tus gastos fácilmente' },
  { key: 'folios', label: 'Gestión de Folios', icon: 'Hash', description: 'CAFs, folios y numeración de documentos' },
  { key: 'contactos', label: 'Contactos', icon: 'Users', description: 'Clientes y proveedores' },
  { key: 'libros', label: 'Compras y Ventas', icon: 'BarChart3', description: 'Libros de compras, ventas y exportación' },
  { key: 'reportes', label: 'Reportes', icon: 'PieChart', description: 'Dashboard, KPIs y estimaciones tributarias' },
  { key: 'contabilidad', label: 'Contabilidad', icon: 'Calculator', description: 'Plan de cuentas, asientos y estados financieros' },
  { key: 'remuneraciones', label: 'Remuneraciones', icon: 'Briefcase', description: 'Liquidaciones y portal del trabajador' },
  { key: 'banco', label: 'Banco', icon: 'Landmark', description: 'Cuentas bancarias y conciliación' },
  { key: 'herramientas', label: 'Herramientas', icon: 'Settings', description: 'Certificación SII y configuración' },
  { key: 'faq', label: 'Preguntas Frecuentes', icon: 'HelpCircle', description: 'Respuestas a las dudas más comunes' },
  { key: 'asistente', label: 'Asistente IA', icon: 'Sparkles', description: 'Tu asistente inteligente de contabilidad' },
]

export const HELP_ARTICLES: HelpArticle[] = [
  // ═══════════════════════════════════════════════════════════════
  // PRIMEROS PASOS
  // ═══════════════════════════════════════════════════════════════
  {
    slug: 'como-empezar',
    title: 'Cómo crear tu cuenta y configurar tu empresa',
    category: 'primeros-pasos',
    categoryLabel: 'Primeros Pasos',
    icon: 'BookOpen',
    summary: 'Guía paso a paso para registrarte en CuentaX, crear tu empresa y dejar todo listo para emitir documentos tributarios electrónicos.',
    keywords: ['crear cuenta', 'registro', 'configurar empresa', 'RUT', 'inicio', 'empezar', 'nueva empresa'],
    sections: [
      {
        title: 'Registro en CuentaX',
        content: 'Para comenzar a usar CuentaX, ingresa a <strong>app.cuentax.cl</strong> y haz clic en "Crear cuenta". Necesitarás un correo electrónico válido y una contraseña segura. Recibirás un email de verificación que debes confirmar antes de continuar.',
        tip: 'Usa el correo corporativo de tu empresa para facilitar la identificación de tu cuenta.',
      },
      {
        title: 'Crear tu primera empresa',
        content: 'Una vez dentro del dashboard, el sistema te pedirá crear tu primera empresa. Ingresa el <strong>RUT de la empresa</strong> (no tu RUT personal) y haz clic en "Buscar SII". CuentaX consultará automáticamente los datos del SII para autocompletar la razón social y el giro.<br/><br/>Completa los campos restantes:<ul><li><strong>Dirección</strong>: Debe coincidir con la registrada en el SII</li><li><strong>Comuna</strong>: La comuna de tu domicilio comercial</li><li><strong>Email</strong>: Correo de contacto de la empresa</li><li><strong>Teléfono</strong>: Número de contacto</li></ul>',
        warning: 'El RUT debe estar registrado en el SII como contribuyente de primera categoría para poder emitir documentos tributarios electrónicos.',
      },
      {
        title: 'Configuración inicial',
        content: 'Después de crear la empresa, te recomendamos completar estos pasos en orden:<ul><li><strong>Subir certificado digital</strong>: Necesario para firmar documentos electrónicos</li><li><strong>Solicitar folios (CAFs)</strong>: Los rangos de numeración autorizados por el SII</li><li><strong>Configurar datos de la empresa</strong>: Logo, datos bancarios para transferencias, texto personalizado para documentos</li></ul>',
        tip: 'Puedes manejar múltiples empresas desde una sola cuenta. Usa el selector de empresa en la barra lateral para cambiar entre ellas.',
      },
    ],
    relatedSlugs: ['certificado-digital', 'primer-documento', 'configuracion-empresa'],
  },
  {
    slug: 'certificado-digital',
    title: 'Cómo subir y configurar tu certificado digital',
    category: 'primeros-pasos',
    categoryLabel: 'Primeros Pasos',
    icon: 'BookOpen',
    summary: 'Aprende a obtener, subir y configurar tu certificado digital (.pfx) para firmar documentos tributarios electrónicos ante el SII.',
    keywords: ['certificado digital', 'pfx', 'p12', 'firma electrónica', 'e-certchile', 'acepta', 'SII'],
    sections: [
      {
        title: '¿Qué es el certificado digital?',
        content: 'El certificado digital es un archivo con extensión <strong>.pfx</strong> o <strong>.p12</strong> que contiene tu firma electrónica avanzada. Es emitido por entidades certificadoras autorizadas por el SII y es <strong>obligatorio</strong> para firmar documentos tributarios electrónicos (DTEs).<br/><br/>Las principales entidades certificadoras en Chile son:<ul><li><strong>E-CertChile</strong> (filial de la Cámara de Comercio)</li><li><strong>Acepta.com</strong></li><li><strong>CertiSign</strong></li><li><strong>TOC Biometrics</strong></li></ul>',
      },
      {
        title: 'Cómo obtener tu certificado',
        content: 'Si aún no tienes certificado digital, debes adquirirlo a través de una entidad certificadora autorizada. El proceso generalmente incluye:<ul><li>Comprar el certificado en línea (desde ~$15.000 CLP/año)</li><li>Verificar tu identidad de forma presencial o remota con biometría</li><li>Descargar el archivo .pfx junto con la contraseña</li></ul>',
        warning: 'El certificado debe estar asociado al RUT del representante legal o de una persona autorizada ante el SII para firmar documentos de la empresa.',
      },
      {
        title: 'Subir el certificado a CuentaX',
        content: 'Ve a <strong>Config. SII</strong> en la barra lateral. En la sección "Certificado Digital":<ul><li>Haz clic en "Subir Certificado"</li><li>Selecciona tu archivo .pfx o .p12</li><li>Ingresa la contraseña del certificado</li><li>Haz clic en "Guardar"</li></ul><br/>CuentaX validará que el certificado sea correcto y mostrará el estado "SII Conectado" en la barra lateral si todo está en orden.',
        tip: 'El certificado se almacena de forma encriptada en nuestros servidores. Nunca compartimos ni exponemos tu certificado o contraseña.',
      },
      {
        title: 'Renovación del certificado',
        content: 'Los certificados digitales tienen una vigencia de <strong>1 a 3 años</strong> dependiendo del plan contratado. CuentaX te notificará cuando tu certificado esté próximo a vencer. Para renovar, simplemente sube el nuevo archivo .pfx siguiendo el mismo proceso.',
        warning: 'Si tu certificado expira, no podrás emitir documentos tributarios electrónicos. Renuévalo con anticipación.',
      },
    ],
    relatedSlugs: ['como-empezar', 'configuracion-empresa', 'certificacion-sii'],
  },
  {
    slug: 'primer-documento',
    title: 'Emitir tu primer documento tributario',
    category: 'primeros-pasos',
    categoryLabel: 'Primeros Pasos',
    icon: 'BookOpen',
    summary: 'Tutorial completo para emitir tu primer DTE en CuentaX: desde seleccionar el tipo de documento hasta enviarlo al SII.',
    keywords: ['primer documento', 'emitir', 'DTE', 'tutorial', 'factura', 'boleta', 'primer paso'],
    sections: [
      {
        title: 'Antes de emitir',
        content: 'Antes de emitir tu primer documento, verifica que tengas:<ul><li><strong>Certificado digital</strong> subido y validado (indicador verde en la barra lateral)</li><li><strong>Folios (CAFs)</strong> disponibles para el tipo de documento que vas a emitir</li><li><strong>Datos de la empresa</strong> completos (RUT, razón social, giro, dirección)</li></ul>',
        warning: 'Si no tienes folios disponibles, el sistema no te permitirá emitir. Ve a "Folios (CAF)" en la barra lateral para solicitar nuevos rangos.',
      },
      {
        title: 'Paso a paso: Emitir un documento',
        content: 'Haz clic en <strong>"Emitir DTE"</strong> en la barra lateral. El flujo de emisión tiene estos pasos:<ul><li><strong>Tipo de documento</strong>: Selecciona Factura (33), Boleta (39), Nota de Crédito (61), etc.</li><li><strong>Receptor</strong>: Ingresa el RUT del cliente. Si ya está en tus contactos, se autocompleta. Si no, puedes buscarlo en el SII.</li><li><strong>Detalle</strong>: Agrega los ítems con descripción, cantidad, precio unitario y descuento si aplica.</li><li><strong>Montos</strong>: CuentaX calcula automáticamente el neto, IVA (19%) y total.</li><li><strong>Enviar</strong>: Revisa el documento y haz clic en "Emitir". El documento se firma digitalmente y se envía al SII.</li></ul>',
        tip: 'Puedes guardar borradores si necesitas completar el documento más tarde.',
      },
      {
        title: '¿Qué pasa después de emitir?',
        content: 'Una vez emitido, el documento pasa por estos estados:<ul><li><strong>Enviado</strong>: El documento fue firmado y enviado al SII</li><li><strong>Aceptado</strong>: El SII validó y aceptó el documento (generalmente en segundos)</li><li><strong>Rechazado</strong>: El SII encontró errores. Revisa el motivo y corrige.</li></ul><br/>Puedes ver todos tus documentos emitidos en <strong>Ventas > Facturas Emitidas</strong>.',
      },
    ],
    relatedSlugs: ['emitir-factura', 'emitir-boleta', 'que-son-cafs'],
  },

  // ═══════════════════════════════════════════════════════════════
  // EMISIÓN DE DOCUMENTOS
  // ═══════════════════════════════════════════════════════════════
  {
    slug: 'emitir-factura',
    title: 'Cómo emitir una Factura Electrónica (Tipo 33)',
    category: 'emision',
    categoryLabel: 'Emisión de Documentos',
    icon: 'FileText',
    summary: 'Guía detallada para emitir facturas electrónicas afectas a IVA, el documento tributario más común en Chile.',
    keywords: ['factura', 'factura electrónica', 'tipo 33', 'DTE 33', 'emitir factura', 'IVA', 'afecta'],
    sections: [
      {
        title: '¿Qué es una Factura Electrónica?',
        content: 'La Factura Electrónica (Tipo 33) es el documento tributario más utilizado en Chile. Se emite cuando vendes bienes o prestas servicios <strong>afectos a IVA</strong> a otro contribuyente (empresa o persona con giro comercial).<br/><br/>Características principales:<ul><li>Grava con IVA del 19%</li><li>El receptor debe ser un contribuyente con RUT</li><li>Permite al receptor usar el IVA como crédito fiscal</li><li>Debe enviarse al SII dentro de los plazos legales</li></ul>',
      },
      {
        title: 'Datos obligatorios de la factura',
        content: 'Para emitir una factura electrónica necesitas:<ul><li><strong>RUT del receptor</strong>: El sistema valida el formato y busca datos en el SII</li><li><strong>Razón social del receptor</strong>: Nombre legal de la empresa</li><li><strong>Giro del receptor</strong>: Actividad económica</li><li><strong>Dirección del receptor</strong>: Dirección comercial</li><li><strong>Comuna del receptor</strong>: Comuna de la dirección</li><li><strong>Detalle de ítems</strong>: Al menos un ítem con nombre, cantidad y precio</li></ul>',
        tip: 'Si el cliente ya está en tus Contactos, todos los datos se autocompletarán al ingresar el RUT.',
      },
      {
        title: 'Cálculo de montos',
        content: 'CuentaX calcula automáticamente los montos de la factura:<ul><li><strong>Monto Neto</strong> = Suma de (cantidad x precio unitario - descuento) por cada ítem</li><li><strong>IVA (19%)</strong> = Monto Neto x 0.19</li><li><strong>Total</strong> = Monto Neto + IVA</li></ul><br/>Los montos se redondean al peso según la normativa del SII. No se permiten decimales en pesos chilenos.',
        warning: 'El SII rechazará facturas donde los montos no cuadren. CuentaX se encarga de los cálculos, pero verifica siempre antes de emitir.',
      },
      {
        title: 'Referencias y documentos asociados',
        content: 'Puedes agregar referencias a otros documentos en tu factura. Esto es útil cuando:<ul><li>La factura se origina de una Guía de Despacho previa</li><li>Necesitas referenciar una orden de compra del cliente</li><li>Estás facturando contra un contrato específico</li></ul><br/>Las referencias incluyen: tipo de documento, folio y fecha del documento referenciado.',
      },
    ],
    relatedSlugs: ['emitir-boleta', 'emitir-nota-credito', 'que-son-cafs'],
  },
  {
    slug: 'emitir-boleta',
    title: 'Cómo emitir una Boleta Electrónica (Tipo 39)',
    category: 'emision',
    categoryLabel: 'Emisión de Documentos',
    icon: 'FileText',
    summary: 'Aprende a emitir boletas electrónicas para ventas a consumidores finales, incluyendo las diferencias clave con las facturas.',
    keywords: ['boleta', 'boleta electrónica', 'tipo 39', 'DTE 39', 'consumidor final', 'venta directa'],
    sections: [
      {
        title: '¿Cuándo emitir una Boleta?',
        content: 'La Boleta Electrónica (Tipo 39) se emite cuando vendes a un <strong>consumidor final</strong>, es decir, una persona que no necesita usar el IVA como crédito fiscal. Es el documento que recibes cuando compras en el supermercado, una tienda o un restaurante.<br/><br/>Diferencias clave con la factura:<ul><li>El IVA va <strong>incluido</strong> en el precio (no se desglosa separadamente para el cliente)</li><li>No es obligatorio el RUT del receptor (puede ser un "receptor genérico")</li><li>No genera crédito fiscal para el comprador</li><li>Se envía al SII en un <strong>EnvioBOLETA</strong> con schema diferente al de facturas</li></ul>',
      },
      {
        title: 'Emitir una boleta en CuentaX',
        content: 'En <strong>Emitir DTE</strong>, selecciona "Boleta Electrónica (39)". El formulario se simplifica:<ul><li><strong>Receptor</strong>: Puedes dejar los campos en blanco para ventas anónimas, o ingresar RUT y nombre si el cliente lo solicita</li><li><strong>Detalle</strong>: Agrega los productos o servicios con el precio <strong>con IVA incluido</strong></li><li><strong>Total</strong>: CuentaX calcula el desglose interno de neto e IVA automáticamente</li></ul>',
        tip: 'En la boleta, el precio que ingresas es el precio final que paga el cliente (IVA incluido). CuentaX hace el cálculo inverso para el desglose tributario.',
      },
      {
        title: 'Consideraciones especiales',
        content: 'Las boletas electrónicas tienen algunas particularidades:<ul><li>Se envían al SII usando el schema <strong>EnvioBOLETA</strong> que tiene campos diferentes al EnvioDTE de facturas</li><li>El campo <strong>RznSocEmisor</strong> reemplaza a RznSoc en el emisor</li><li>No llevan campo <strong>FmaPago</strong> (forma de pago)</li><li>No llevan <strong>Acteco</strong> (actividad económica del emisor)</li><li>Las referencias usan código <strong>SET</strong> en lugar de otros tipos</li></ul>',
        warning: 'Los folios de boletas (Tipo 39) son diferentes a los de facturas (Tipo 33). Necesitas solicitar CAFs específicos para cada tipo de documento.',
      },
    ],
    relatedSlugs: ['emitir-factura', 'que-son-cafs', 'solicitar-folios'],
  },
  {
    slug: 'emitir-nota-credito',
    title: 'Cómo emitir una Nota de Crédito (Tipo 61)',
    category: 'emision',
    categoryLabel: 'Emisión de Documentos',
    icon: 'FileText',
    summary: 'Guía para emitir notas de crédito electrónicas: anulaciones totales, parciales, correcciones de montos y devoluciones.',
    keywords: ['nota de crédito', 'tipo 61', 'DTE 61', 'anulación', 'devolución', 'corrección', 'NC'],
    sections: [
      {
        title: '¿Cuándo se emite una Nota de Crédito?',
        content: 'La Nota de Crédito Electrónica (Tipo 61) se utiliza para:<ul><li><strong>Anular completamente</strong> una factura o boleta emitida</li><li><strong>Corregir montos</strong>: Si facturaste de más, emites una NC por la diferencia</li><li><strong>Devoluciones</strong>: Cuando el cliente devuelve mercadería</li><li><strong>Descuentos posteriores</strong>: Descuentos aplicados después de la facturación</li><li><strong>Corregir datos</strong>: Errores en RUT, razón social, giro u otros datos del receptor</li></ul>',
        warning: 'Una Nota de Crédito SIEMPRE debe referenciar un documento original (factura o boleta). No puede existir una NC sin referencia.',
      },
      {
        title: 'Cómo emitir una NC en CuentaX',
        content: 'En <strong>Emitir DTE</strong>, selecciona "Nota de Crédito (61)". El flujo es:<ul><li><strong>Referencia obligatoria</strong>: Selecciona el documento original. CuentaX copia automáticamente los datos del receptor.</li><li><strong>Código de referencia</strong>: Elige el motivo (anula documento, corrige monto, etc.)</li><li><strong>Detalle</strong>: Para anulaciones totales, se copian los ítems del original. Para parciales, ajusta las cantidades o montos.</li></ul>',
        tip: 'Para anulaciones totales, usa el botón "Anular" directamente desde la vista del documento original. CuentaX generará la NC automáticamente con todos los datos prellenados.',
      },
      {
        title: 'Códigos de referencia para NC',
        content: 'Al emitir una NC, debes indicar el código de referencia que explica el motivo:<ul><li><strong>1 - Anula Documento de Referencia</strong>: Anulación total del documento</li><li><strong>2 - Corrige Texto del Documento de Referencia</strong>: Corrección de datos (RUT, razón social, etc.)</li><li><strong>3 - Corrige Montos</strong>: Ajuste parcial de montos</li></ul><br/>El SII valida que el código de referencia sea coherente con el contenido de la NC.',
      },
    ],
    relatedSlugs: ['emitir-nota-debito', 'emitir-factura', 'libro-ventas'],
  },
  {
    slug: 'emitir-nota-debito',
    title: 'Cómo emitir una Nota de Débito (Tipo 56)',
    category: 'emision',
    categoryLabel: 'Emisión de Documentos',
    icon: 'FileText',
    summary: 'Aprende a emitir notas de débito electrónicas para aumentar montos de facturas o cobrar diferencias.',
    keywords: ['nota de débito', 'tipo 56', 'DTE 56', 'aumento', 'cobro adicional', 'ND'],
    sections: [
      {
        title: '¿Cuándo se emite una Nota de Débito?',
        content: 'La Nota de Débito Electrónica (Tipo 56) es el documento inverso a la Nota de Crédito. Se utiliza para:<ul><li><strong>Aumentar montos</strong>: Si facturaste de menos, emites una ND por la diferencia</li><li><strong>Cobros adicionales</strong>: Intereses por mora, recargos</li><li><strong>Corregir una NC excesiva</strong>: Si emitiste una Nota de Crédito por un monto mayor al correcto</li></ul>',
      },
      {
        title: 'Emisión en CuentaX',
        content: 'El proceso es similar a la Nota de Crédito:<ul><li>Selecciona "Nota de Débito (56)" en Emitir DTE</li><li>Referencia el documento original (factura o NC)</li><li>Agrega el detalle con los ítems y montos adicionales</li><li>El sistema calcula el IVA adicional automáticamente</li></ul>',
        tip: 'Las Notas de Débito son poco frecuentes. En la mayoría de los casos, es más simple emitir una nueva factura por el monto adicional.',
      },
      {
        title: 'Impacto tributario',
        content: 'Las Notas de Débito <strong>aumentan</strong> el débito fiscal del emisor y el crédito fiscal del receptor. Aparecen en el Libro de Ventas sumando al total de ventas del período, a diferencia de las NC que restan.',
      },
    ],
    relatedSlugs: ['emitir-nota-credito', 'emitir-factura', 'libro-ventas'],
  },
  {
    slug: 'emitir-guia-despacho',
    title: 'Cómo emitir una Guía de Despacho (Tipo 52)',
    category: 'emision',
    categoryLabel: 'Emisión de Documentos',
    icon: 'FileText',
    summary: 'Guía para emitir guías de despacho electrónicas para el traslado de mercadería.',
    keywords: ['guía de despacho', 'tipo 52', 'DTE 52', 'traslado', 'mercadería', 'despacho', 'transporte'],
    sections: [
      {
        title: '¿Qué es una Guía de Despacho?',
        content: 'La Guía de Despacho Electrónica (Tipo 52) es un documento que ampara el <strong>traslado de mercaderías</strong>. Es obligatoria cuando transportas bienes de un lugar a otro, ya sea:<ul><li><strong>Venta con despacho</strong>: Envías productos vendidos al cliente</li><li><strong>Traslado interno</strong>: Mueves mercadería entre bodegas propias</li><li><strong>Consignación</strong>: Envías productos en consignación</li><li><strong>Exportación</strong>: Traslado a puerto o aeropuerto para exportar</li></ul>',
        warning: 'El transporte de mercaderías sin guía de despacho puede resultar en multas y decomiso por parte del SII o Carabineros.',
      },
      {
        title: 'Datos específicos de la guía',
        content: 'Además de los datos estándar de un DTE, la guía de despacho incluye:<ul><li><strong>Indicador de traslado</strong>: Motivo del despacho (venta, traslado interno, etc.)</li><li><strong>Dirección de destino</strong>: Donde se entregará la mercadería</li><li><strong>Patente del vehículo</strong>: Del transporte que realiza el despacho</li><li><strong>Transportista</strong>: Datos del chofer o empresa de transporte</li></ul>',
        tip: 'La guía de despacho puede emitirse antes de la factura. Luego puedes facturar referenciando la guía.',
      },
      {
        title: 'Facturación posterior',
        content: 'Si emitiste una guía de despacho por una venta, tienes un plazo para facturar:<ul><li>La factura debe emitirse dentro del <strong>mismo período tributario</strong> (mes) del despacho</li><li>Al emitir la factura, referencia la guía con el código correspondiente</li><li>Si se despachan varias guías, puedes facturar todas en una sola factura</li></ul>',
      },
    ],
    relatedSlugs: ['emitir-factura', 'emitir-nota-credito', 'libro-ventas'],
  },

  // ═══════════════════════════════════════════════════════════════
  // GASTOS Y OCR
  // ═══════════════════════════════════════════════════════════════
  {
    slug: 'escanear-boleta',
    title: 'Cómo escanear una boleta o factura con la cámara',
    category: 'gastos',
    categoryLabel: 'Gastos y OCR',
    icon: 'Camera',
    summary: 'Usa la cámara de tu celular o computador para digitalizar boletas y facturas de gastos automáticamente con OCR inteligente.',
    keywords: ['escanear', 'cámara', 'OCR', 'foto', 'boleta', 'factura', 'digitalizar', 'gasto'],
    sections: [
      {
        title: 'Cómo funciona el escaneo OCR',
        content: 'CuentaX utiliza tecnología de <strong>reconocimiento óptico de caracteres (OCR)</strong> con inteligencia artificial para extraer automáticamente los datos de tus boletas y facturas de gastos.<br/><br/>El sistema identifica:<ul><li><strong>RUT del emisor</strong></li><li><strong>Razón social</strong></li><li><strong>Fecha de emisión</strong></li><li><strong>Monto total y neto</strong></li><li><strong>IVA</strong></li><li><strong>Tipo de documento</strong> (boleta, factura)</li></ul>',
      },
      {
        title: 'Paso a paso: Escanear un documento',
        content: 'Ve a <strong>Gastos > Escanear Documento</strong> en la barra lateral:<ul><li>Se activará la cámara de tu dispositivo</li><li>Enfoca el documento completo, asegurándote de que se lean los montos y el RUT</li><li>Toma la foto. El sistema procesará la imagen en segundos.</li><li>Revisa los datos extraídos y corrige si es necesario</li><li>Selecciona la categoría de gasto</li><li>Haz clic en "Guardar Gasto"</li></ul>',
        tip: 'Para mejores resultados, toma la foto con buena iluminación y sin reflejos. Asegúrate de que el documento esté recto y completo en el encuadre.',
      },
      {
        title: 'Desde el celular como PWA',
        content: 'CuentaX funciona como <strong>Progressive Web App (PWA)</strong>. Puedes instalarla en tu celular como si fuera una app nativa:<ul><li>Abre CuentaX en Chrome o Safari</li><li>Selecciona "Agregar a pantalla de inicio"</li><li>Ahora puedes escanear boletas directamente desde tu celular cuando estés en terreno</li></ul>',
      },
    ],
    relatedSlugs: ['registrar-gasto-manual', 'categorias-gastos'],
  },
  {
    slug: 'registrar-gasto-manual',
    title: 'Cómo registrar un gasto manualmente',
    category: 'gastos',
    categoryLabel: 'Gastos y OCR',
    icon: 'Camera',
    summary: 'Registra gastos de forma manual cuando no tienes el documento físico o necesitas ingresar datos específicos.',
    keywords: ['gasto manual', 'registrar gasto', 'ingresar gasto', 'compra', 'proveedor'],
    sections: [
      {
        title: 'Cuándo registrar manualmente',
        content: 'El registro manual es útil cuando:<ul><li>No tienes el documento físico disponible para escanear</li><li>El documento está dañado o ilegible</li><li>Son gastos recurrentes que ya conoces los datos</li><li>Gastos en el extranjero sin formato chileno</li></ul>',
      },
      {
        title: 'Cómo ingresar un gasto',
        content: 'Ve a <strong>Gastos > Mis Gastos</strong> y haz clic en "Nuevo Gasto":<ul><li><strong>Proveedor</strong>: Selecciona de tus contactos o ingresa manualmente</li><li><strong>RUT del proveedor</strong>: Si está en tus contactos, se autocompleta</li><li><strong>Tipo de documento</strong>: Factura, boleta, recibo, etc.</li><li><strong>Número/Folio</strong>: El número del documento</li><li><strong>Fecha</strong>: Fecha de emisión del documento</li><li><strong>Monto neto</strong>: Monto sin IVA</li><li><strong>IVA</strong>: Se calcula automáticamente (19%) o puedes ajustarlo</li><li><strong>Total</strong>: Se calcula automáticamente</li><li><strong>Categoría</strong>: Selecciona la categoría que corresponda</li></ul>',
        tip: 'Al registrar una factura de compra, el IVA se convierte en crédito fiscal que descuenta de tu débito fiscal en el F29.',
      },
    ],
    relatedSlugs: ['escanear-boleta', 'categorias-gastos', 'libro-compras'],
  },
  {
    slug: 'categorias-gastos',
    title: 'Categorías de gastos y su impacto tributario',
    category: 'gastos',
    categoryLabel: 'Gastos y OCR',
    icon: 'Camera',
    summary: 'Entiende las categorías de gastos en CuentaX y cómo afectan tu declaración de impuestos en Chile.',
    keywords: ['categorías', 'gastos', 'tributario', 'impuestos', 'deducible', 'crédito fiscal', 'gasto aceptado'],
    sections: [
      {
        title: 'Categorías disponibles',
        content: 'CuentaX organiza los gastos en categorías alineadas con las cuentas contables chilenas:<ul><li><strong>Arriendos</strong>: Arriendo de oficinas, bodegas, locales</li><li><strong>Servicios básicos</strong>: Electricidad, agua, gas, internet, teléfono</li><li><strong>Suministros de oficina</strong>: Materiales, papelería, insumos</li><li><strong>Transporte y combustible</strong>: Bencina, peajes, estacionamiento</li><li><strong>Alimentación</strong>: Almuerzos de trabajo, coffee break</li><li><strong>Tecnología</strong>: Software, hosting, licencias, hardware</li><li><strong>Marketing</strong>: Publicidad, diseño, redes sociales</li><li><strong>Honorarios profesionales</strong>: Contadores, abogados, consultores</li><li><strong>Seguros</strong>: Seguros de la empresa</li><li><strong>Otros gastos</strong>: Gastos que no encajan en las categorías anteriores</li></ul>',
      },
      {
        title: 'Gastos aceptados tributariamente',
        content: 'Para que un gasto sea <strong>deducible</strong> de tu base imponible, debe cumplir los requisitos del artículo 31 de la Ley sobre Impuesto a la Renta:<ul><li>Ser <strong>necesario</strong> para producir la renta</li><li>Estar <strong>pagado o adeudado</strong> durante el período</li><li>Estar <strong>acreditado o justificado</strong> fehacientemente (tener el documento)</li><li>No estar expresamente <strong>rechazado</strong> por la ley</li></ul>',
        warning: 'Gastos personales no relacionados con la actividad de la empresa NO son deducibles y pueden resultar en observaciones del SII.',
      },
      {
        title: 'Impacto en el IVA (crédito fiscal)',
        content: 'Si el gasto está respaldado por una <strong>factura</strong> (no boleta), el IVA pagado se convierte en <strong>crédito fiscal</strong>:<ul><li>El crédito fiscal se resta del débito fiscal (IVA de tus ventas)</li><li>Si el crédito es mayor que el débito, el remanente se arrastra al mes siguiente</li><li>Las boletas de compra NO generan crédito fiscal</li></ul>',
        tip: 'Siempre pide factura en lugar de boleta cuando compres para la empresa. La diferencia es un 19% de ahorro en IVA.',
      },
    ],
    relatedSlugs: ['escanear-boleta', 'registrar-gasto-manual', 'f29-estimado'],
  },

  // ═══════════════════════════════════════════════════════════════
  // GESTIÓN DE FOLIOS
  // ═══════════════════════════════════════════════════════════════
  {
    slug: 'que-son-cafs',
    title: 'Qué son los CAFs y cómo funcionan',
    category: 'folios',
    categoryLabel: 'Gestión de Folios',
    icon: 'Hash',
    summary: 'Entiende qué son los Códigos de Autorización de Folios (CAFs) y por qué son esenciales para emitir documentos electrónicos.',
    keywords: ['CAF', 'folios', 'código de autorización', 'numeración', 'SII', 'rango', 'timbre'],
    sections: [
      {
        title: '¿Qué es un CAF?',
        content: 'El <strong>Código de Autorización de Folios (CAF)</strong> es un archivo XML que el SII te entrega cuando solicitas rangos de folios para emitir documentos tributarios electrónicos. Contiene:<ul><li><strong>Rango de folios</strong>: Números autorizados (ejemplo: del 1 al 100)</li><li><strong>RUT del emisor</strong>: Tu empresa</li><li><strong>Tipo de documento</strong>: Para qué tipo de DTE son válidos (33, 39, 61, etc.)</li><li><strong>Clave pública y privada</strong>: Usadas para generar el Timbre Electrónico (TED) de cada documento</li><li><strong>Fecha de autorización</strong>: Cuándo fueron autorizados</li></ul>',
      },
      {
        title: '¿Cómo funciona la numeración?',
        content: 'Cada documento tributario electrónico tiene un <strong>número de folio único</strong>. CuentaX asigna automáticamente el siguiente folio disponible al emitir un documento.<br/><br/>Reglas importantes:<ul><li>Los folios son <strong>secuenciales</strong>: no puedes saltarte números</li><li>Cada tipo de documento tiene su <strong>propio rango</strong> de folios</li><li>Los folios <strong>no se reutilizan</strong>: si un documento falla, el folio se marca como anulado</li><li>Debes tener folios <strong>vigentes</strong> para emitir (no vencidos)</li></ul>',
        warning: 'Si un folio es rechazado por el SII, ese número NO puede volver a usarse. CuentaX marca automáticamente los folios rechazados como anulados.',
      },
      {
        title: 'El Timbre Electrónico (TED)',
        content: 'Cada DTE lleva un <strong>Timbre Electrónico (TED)</strong>, que es un código generado con la clave privada del CAF. El TED contiene datos del documento (RUT, folio, monto, fecha) y permite verificar su autenticidad.<br/><br/>El TED se incluye como un código de barras bidimensional (similar a un QR) en la representación impresa del documento. Es fundamental que el folio y el CAF coincidan correctamente para que el TED sea válido.',
        tip: 'CuentaX maneja automáticamente la asociación entre folios y CAFs. Nunca necesitas manipular los archivos CAF manualmente.',
      },
    ],
    relatedSlugs: ['solicitar-folios', 'emitir-factura', 'certificacion-sii'],
  },
  {
    slug: 'solicitar-folios',
    title: 'Cómo solicitar folios nuevos en el SII',
    category: 'folios',
    categoryLabel: 'Gestión de Folios',
    icon: 'Hash',
    summary: 'Paso a paso para solicitar nuevos rangos de folios (CAFs) al SII directamente desde CuentaX.',
    keywords: ['solicitar folios', 'nuevos folios', 'CAF', 'SII', 'rango', 'pedir folios'],
    sections: [
      {
        title: 'Cuándo solicitar nuevos folios',
        content: 'Necesitas solicitar nuevos folios cuando:<ul><li>Estás empezando y no tienes folios aún</li><li>Te quedan <strong>pocos folios disponibles</strong> (CuentaX te alerta automáticamente)</li><li>Tus folios actuales están <strong>por vencer</strong> (los CAFs tienen fecha de expiración)</li><li>Necesitas folios para un <strong>nuevo tipo de documento</strong></li></ul>',
        tip: 'CuentaX te notifica cuando te quedan menos de 10 folios disponibles. Solicita nuevos con anticipación para no quedarte sin numeración.',
      },
      {
        title: 'Solicitar desde CuentaX',
        content: 'Ve a <strong>Herramientas > Folios (CAF)</strong> en la barra lateral:<ul><li>Verás el estado actual de tus folios por tipo de documento</li><li>Haz clic en "Solicitar Folios" para el tipo que necesites</li><li>Selecciona la cantidad de folios a solicitar (10, 50, 100, etc.)</li><li>CuentaX se conecta al SII usando tu certificado digital y solicita automáticamente el CAF</li><li>El nuevo rango se activa inmediatamente para emitir</li></ul>',
        warning: 'Para solicitar folios, tu certificado digital debe estar vigente y correctamente configurado. Si el indicador SII muestra "Sin conexión", revisa tu certificado primero.',
      },
      {
        title: 'Gestión de múltiples CAFs',
        content: 'CuentaX puede manejar múltiples CAFs simultáneamente para el mismo tipo de documento. Cuando se agotan los folios de un CAF, el sistema pasa automáticamente al siguiente.<br/><br/>En la vista de folios puedes ver:<ul><li><strong>Folios disponibles</strong>: Cuántos te quedan por usar</li><li><strong>Folios usados</strong>: Cuántos has emitido</li><li><strong>Folios anulados</strong>: Números que no se pudieron usar</li><li><strong>Estado del CAF</strong>: Vigente o vencido</li></ul>',
      },
    ],
    relatedSlugs: ['que-son-cafs', 'certificado-digital', 'emitir-factura'],
  },

  // ═══════════════════════════════════════════════════════════════
  // CONTACTOS
  // ═══════════════════════════════════════════════════════════════
  {
    slug: 'gestionar-clientes',
    title: 'Cómo crear y gestionar clientes',
    category: 'contactos',
    categoryLabel: 'Contactos',
    icon: 'Users',
    summary: 'Administra tu base de clientes en CuentaX para autocompletar datos al emitir documentos tributarios.',
    keywords: ['clientes', 'contactos', 'RUT', 'receptor', 'autocompletar', 'crear cliente'],
    sections: [
      {
        title: 'Agregar un cliente',
        content: 'Ve a <strong>Contactos</strong> en la barra lateral y haz clic en "Nuevo Contacto":<ul><li>Ingresa el <strong>RUT</strong> del cliente y haz clic en "SII" para buscar automáticamente sus datos</li><li>Completa la <strong>razón social</strong>, <strong>giro</strong>, <strong>dirección</strong> y <strong>comuna</strong></li><li>Agrega <strong>email</strong> y <strong>teléfono</strong> de contacto</li><li>Marca la casilla <strong>"Cliente"</strong></li><li>Haz clic en "Guardar"</li></ul>',
        tip: 'Un contacto puede ser cliente Y proveedor a la vez. Marca ambas casillas si aplica.',
      },
      {
        title: 'Autocompletado en emisión',
        content: 'Cuando emites un DTE, al ingresar el RUT del receptor, CuentaX busca primero en tus contactos guardados. Si encuentra una coincidencia, autocompleta automáticamente:<ul><li>Razón social</li><li>Giro</li><li>Dirección y comuna</li><li>Email (para envío automático del documento)</li></ul><br/>Esto agiliza significativamente la emisión de documentos para clientes recurrentes.',
      },
      {
        title: 'Búsqueda y filtros',
        content: 'En la vista de contactos puedes:<ul><li><strong>Buscar</strong> por nombre o RUT usando la barra de búsqueda</li><li><strong>Filtrar</strong> por tipo: Todos, Clientes o Proveedores</li><li>Ver cuántos <strong>DTEs</strong> has emitido a cada contacto</li><li><strong>Emitir DTE</strong> directamente desde la tarjeta del contacto</li></ul>',
      },
    ],
    relatedSlugs: ['gestionar-proveedores', 'emitir-factura'],
  },
  {
    slug: 'gestionar-proveedores',
    title: 'Cómo crear y gestionar proveedores',
    category: 'contactos',
    categoryLabel: 'Contactos',
    icon: 'Users',
    summary: 'Registra tus proveedores para facilitar el registro de gastos y compras.',
    keywords: ['proveedores', 'contactos', 'compras', 'gastos', 'crear proveedor'],
    sections: [
      {
        title: 'Agregar un proveedor',
        content: 'El proceso es igual que agregar un cliente, pero marca la casilla <strong>"Proveedor"</strong> en el formulario de contacto. Los proveedores se usan para:<ul><li>Autocompletar datos al registrar gastos</li><li>Asociar compras con proveedores específicos</li><li>Llevar control de cuánto compras a cada proveedor</li></ul>',
      },
      {
        title: 'Proveedores y el Libro de Compras',
        content: 'Cuando registras un gasto asociado a un proveedor, el documento aparece en tu <strong>Libro de Compras</strong>. Esto es fundamental para:<ul><li>Declarar correctamente el <strong>crédito fiscal</strong> (IVA de compras)</li><li>Cruzar información con el SII en el proceso de <strong>Registro de Compras</strong></li><li>Generar reportes de compras por proveedor</li></ul>',
        tip: 'Mantén tus proveedores actualizados para que los reportes de compras sean precisos y la conciliación con el SII sea automática.',
      },
    ],
    relatedSlugs: ['gestionar-clientes', 'registrar-gasto-manual', 'libro-compras'],
  },

  // ═══════════════════════════════════════════════════════════════
  // COMPRAS Y VENTAS
  // ═══════════════════════════════════════════════════════════════
  {
    slug: 'libro-ventas',
    title: 'Cómo consultar tu Libro de Ventas',
    category: 'libros',
    categoryLabel: 'Compras y Ventas',
    icon: 'BarChart3',
    summary: 'Consulta tu Libro de Ventas mensual con todos los documentos emitidos, montos y desglose de IVA.',
    keywords: ['libro de ventas', 'ventas', 'IVA', 'débito fiscal', 'resumen mensual', 'libro electrónico'],
    sections: [
      {
        title: '¿Qué es el Libro de Ventas?',
        content: 'El Libro de Ventas es un registro tributario obligatorio que contiene <strong>todos los documentos de venta</strong> emitidos durante un período (mes). Incluye facturas, boletas, notas de crédito y notas de débito.<br/><br/>CuentaX genera este libro automáticamente a partir de los documentos que emites. No necesitas ingresarlo manualmente.',
      },
      {
        title: 'Cómo consultarlo',
        content: 'Ve a <strong>Ventas > Resumen Ventas</strong> o a <strong>Contabilidad > Libro C/V</strong>:<ul><li>Selecciona el <strong>mes y año</strong> que deseas consultar</li><li>Verás el listado de todos los documentos emitidos con: fecha, tipo, folio, RUT receptor, neto, IVA y total</li><li>Al final del listado está el <strong>resumen</strong> con totales por tipo de documento</li><li>El <strong>débito fiscal</strong> (IVA a pagar) se calcula automáticamente</li></ul>',
      },
      {
        title: 'Relación con el F29',
        content: 'Los totales del Libro de Ventas alimentan directamente tu <strong>declaración mensual F29</strong>:<ul><li><strong>Débito fiscal</strong>: IVA total de ventas del mes</li><li><strong>Ventas netas</strong>: Base imponible</li><li><strong>NC emitidas</strong>: Se restan del débito fiscal</li></ul><br/>CuentaX pre-calcula estos valores para que puedas verificar antes de declarar en el SII.',
        tip: 'Revisa tu Libro de Ventas antes del día 12 de cada mes (plazo para declarar el F29) y verifica que todos los documentos estén correctos.',
      },
    ],
    relatedSlugs: ['libro-compras', 'f29-estimado', 'exportar-datos'],
  },
  {
    slug: 'libro-compras',
    title: 'Cómo consultar tu Libro de Compras',
    category: 'libros',
    categoryLabel: 'Compras y Ventas',
    icon: 'BarChart3',
    summary: 'Revisa tu Libro de Compras mensual con todas las facturas de proveedores y el crédito fiscal acumulado.',
    keywords: ['libro de compras', 'compras', 'crédito fiscal', 'proveedores', 'facturas recibidas'],
    sections: [
      {
        title: '¿Qué es el Libro de Compras?',
        content: 'El Libro de Compras registra <strong>todas las facturas de compra</strong> que recibes de tus proveedores durante un período. El IVA de estas facturas constituye tu <strong>crédito fiscal</strong>, que se descuenta del débito fiscal (IVA de ventas) en la declaración mensual.',
      },
      {
        title: 'Cómo se alimenta el libro',
        content: 'El Libro de Compras se construye a partir de:<ul><li><strong>Gastos escaneados</strong> con la cámara (OCR)</li><li><strong>Gastos registrados manualmente</strong></li><li><strong>Facturas de compra importadas</strong> desde el Registro de Compras del SII</li></ul><br/>CuentaX cruza automáticamente los datos con el SII para verificar que las facturas sean válidas.',
        tip: 'Registra tus gastos durante el mes para tener el Libro de Compras actualizado al momento de declarar.',
      },
      {
        title: 'Crédito fiscal y proporcionalidad',
        content: 'No todas las compras generan crédito fiscal al 100%:<ul><li><strong>Boletas</strong>: No generan crédito fiscal</li><li><strong>Facturas de compras mixtas</strong>: Si vendes productos afectos y exentos, el crédito fiscal se calcula proporcionalmente</li><li><strong>Facturas con IVA no recuperable</strong>: Algunos gastos tienen restricciones (por ejemplo, vehículos particulares)</li></ul>',
      },
    ],
    relatedSlugs: ['libro-ventas', 'registrar-gasto-manual', 'f29-estimado'],
  },
  {
    slug: 'exportar-datos',
    title: 'Cómo exportar datos a CSV',
    category: 'libros',
    categoryLabel: 'Compras y Ventas',
    icon: 'BarChart3',
    summary: 'Exporta tus libros de compras, ventas, contactos y reportes a archivos CSV para análisis externo o entrega al contador.',
    keywords: ['exportar', 'CSV', 'Excel', 'descargar', 'datos', 'contador', 'planilla'],
    sections: [
      {
        title: 'Dónde exportar',
        content: 'CuentaX permite exportar datos desde múltiples secciones:<ul><li><strong>Libro de Ventas</strong>: Exporta todos los documentos emitidos del mes</li><li><strong>Libro de Compras</strong>: Exporta todas las facturas de compra del mes</li><li><strong>Contactos</strong>: Lista completa de clientes y proveedores</li><li><strong>Documentos</strong>: Detalle de DTEs emitidos con filtros</li><li><strong>Gastos</strong>: Registro completo de gastos con categorías</li></ul>',
      },
      {
        title: 'Formato del archivo',
        content: 'Los archivos se exportan en formato <strong>CSV (Comma Separated Values)</strong>, compatible con:<ul><li>Microsoft Excel</li><li>Google Sheets</li><li>LibreOffice Calc</li><li>Cualquier software contable</li></ul><br/>El archivo incluye encabezados descriptivos y los montos formateados sin separador de miles para facilitar cálculos.',
        tip: 'Al abrir el CSV en Excel, usa "Datos > Obtener datos desde archivo de texto" para configurar correctamente los delimitadores y la codificación UTF-8.',
      },
    ],
    relatedSlugs: ['libro-ventas', 'libro-compras', 'dashboard-kpis'],
  },

  // ═══════════════════════════════════════════════════════════════
  // REPORTES
  // ═══════════════════════════════════════════════════════════════
  {
    slug: 'dashboard-kpis',
    title: 'Cómo leer el Dashboard y KPIs',
    category: 'reportes',
    categoryLabel: 'Reportes',
    icon: 'PieChart',
    summary: 'Entiende los indicadores clave de tu dashboard: ventas del mes, IVA estimado, gastos y comparativas.',
    keywords: ['dashboard', 'KPI', 'indicadores', 'ventas', 'panel principal', 'métricas'],
    sections: [
      {
        title: 'Panel Principal',
        content: 'El Dashboard de CuentaX muestra un resumen en tiempo real de tu situación financiera y tributaria:<ul><li><strong>Ventas del Mes</strong>: Total neto vendido en el período actual</li><li><strong>Compras del Mes</strong>: Total neto de facturas de compra registradas</li><li><strong>IVA a Pagar (estimado)</strong>: Diferencia entre débito fiscal (ventas) y crédito fiscal (compras)</li><li><strong>Documentos Emitidos</strong>: Cantidad de DTEs emitidos en el mes</li></ul>',
      },
      {
        title: 'Gráficos y tendencias',
        content: 'El dashboard incluye visualizaciones para entender la evolución de tu negocio:<ul><li><strong>Ventas vs Compras</strong>: Gráfico de barras comparativo por mes (últimos 6 meses)</li><li><strong>Distribución por tipo de DTE</strong>: Cuántas facturas, boletas, NC emitiste</li><li><strong>Top clientes</strong>: Los clientes con más facturación</li><li><strong>Gastos por categoría</strong>: Distribución de tus gastos en categorías</li></ul>',
        tip: 'Revisa el dashboard al menos una vez por semana para detectar tendencias o anomalías a tiempo.',
      },
      {
        title: 'Alertas y notificaciones',
        content: 'El panel también muestra alertas importantes:<ul><li><strong>Folios bajos</strong>: Cuando te quedan pocos folios disponibles</li><li><strong>Certificado por vencer</strong>: Tu certificado digital está próximo a expirar</li><li><strong>Documentos pendientes</strong>: DTEs enviados que aún no han sido aceptados por el SII</li><li><strong>Plazo F29</strong>: Recordatorio del vencimiento para declarar</li></ul>',
      },
    ],
    relatedSlugs: ['f29-estimado', 'libro-ventas', 'libro-compras'],
  },
  {
    slug: 'f29-estimado',
    title: 'Cómo funciona el estimado del F29',
    category: 'reportes',
    categoryLabel: 'Reportes',
    icon: 'PieChart',
    summary: 'Entiende cómo CuentaX calcula tu estimación del formulario F29 y qué debes verificar antes de declarar.',
    keywords: ['F29', 'formulario 29', 'declaración mensual', 'IVA', 'PPM', 'débito', 'crédito', 'SII'],
    sections: [
      {
        title: '¿Qué es el F29?',
        content: 'El <strong>Formulario 29</strong> es la declaración mensual de IVA y pagos provisionales mensuales (PPM) que todo contribuyente de primera categoría debe presentar al SII. Se declara <strong>antes del día 12</strong> de cada mes sobre las operaciones del mes anterior.<br/><br/>Los principales componentes son:<ul><li><strong>Débito fiscal</strong>: IVA cobrado en tus ventas</li><li><strong>Crédito fiscal</strong>: IVA pagado en tus compras</li><li><strong>IVA a pagar</strong>: Débito - Crédito (si es positivo)</li><li><strong>Remanente</strong>: Si el crédito supera al débito, se acumula</li><li><strong>PPM</strong>: Pago provisional mensual obligatorio sobre ventas</li></ul>',
      },
      {
        title: 'Cómo CuentaX calcula el estimado',
        content: 'CuentaX genera un <strong>estimado del F29</strong> basándose en los datos que tienes registrados:<ul><li>Suma todos los <strong>documentos de venta</strong> del período (facturas, boletas, NC, ND)</li><li>Suma todas las <strong>facturas de compra</strong> registradas</li><li>Calcula la diferencia de IVA (débito - crédito)</li><li>Estima el PPM según la tasa vigente</li></ul><br/>Puedes ver este estimado en <strong>Reportes</strong> o en el Dashboard.',
        warning: 'El estimado es REFERENCIAL. La declaración oficial se hace directamente en el sitio web del SII (sii.cl). CuentaX te da los números para que puedas verificar, pero no reemplaza la declaración formal.',
      },
      {
        title: 'Verificación y cruce con el SII',
        content: 'Antes de declarar, CuentaX te permite verificar que:<ul><li>Todos los <strong>documentos emitidos</strong> estén aceptados por el SII</li><li>Las <strong>facturas de compra</strong> estén en el Registro de Compras del SII</li><li>Los <strong>montos cuadren</strong> entre tu sistema y lo que el SII tiene registrado</li><li>No haya <strong>documentos pendientes</strong> de envío o con observaciones</li></ul>',
        tip: 'Declara con tiempo. Si declaras después del día 12, el SII aplica multas e intereses sobre el monto a pagar.',
      },
    ],
    relatedSlugs: ['libro-ventas', 'libro-compras', 'dashboard-kpis'],
  },

  // ═══════════════════════════════════════════════════════════════
  // CONTABILIDAD
  // ═══════════════════════════════════════════════════════════════
  {
    slug: 'plan-cuentas',
    title: 'Plan de cuentas y estructura contable',
    category: 'contabilidad',
    categoryLabel: 'Contabilidad',
    icon: 'Calculator',
    summary: 'Conoce el plan de cuentas predefinido de CuentaX, alineado con la normativa chilena y las IFRS.',
    keywords: ['plan de cuentas', 'cuentas contables', 'estructura', 'IFRS', 'PCGA', 'activo', 'pasivo'],
    sections: [
      {
        title: 'Estructura del plan de cuentas',
        content: 'CuentaX viene con un plan de cuentas predefinido basado en la normativa chilena y las <strong>Normas Internacionales de Información Financiera (IFRS)</strong>. La estructura es:<ul><li><strong>1 - Activos</strong>: Activos corrientes y no corrientes</li><li><strong>2 - Pasivos</strong>: Pasivos corrientes y no corrientes</li><li><strong>3 - Patrimonio</strong>: Capital, reservas, resultados acumulados</li><li><strong>4 - Ingresos</strong>: Ventas, otros ingresos operacionales</li><li><strong>5 - Costos</strong>: Costo de ventas, costos de producción</li><li><strong>6 - Gastos</strong>: Gastos administrativos, de ventas, financieros</li></ul>',
      },
      {
        title: 'Personalizar el plan',
        content: 'Puedes personalizar el plan de cuentas según las necesidades de tu empresa:<ul><li><strong>Agregar cuentas</strong>: Crea subcuentas dentro de las categorías existentes</li><li><strong>Desactivar cuentas</strong>: Oculta cuentas que no usas</li><li><strong>Renombrar</strong>: Ajusta los nombres a tu nomenclatura interna</li></ul><br/>Ve a <strong>Contabilidad > Plan de Cuentas</strong> para ver y editar la estructura.',
        warning: 'No elimines cuentas que ya tienen movimientos. En su lugar, desactívalas para que no aparezcan en la selección pero mantengan el historial.',
      },
      {
        title: 'Cuentas automáticas',
        content: 'CuentaX asocia automáticamente ciertas operaciones a cuentas predefinidas:<ul><li><strong>Ventas</strong>: Se registran en la cuenta 4.1.01 (Ventas afectas)</li><li><strong>IVA Débito</strong>: Cuenta 2.1.04 (IVA Débito Fiscal)</li><li><strong>IVA Crédito</strong>: Cuenta 1.1.05 (IVA Crédito Fiscal)</li><li><strong>Cuentas por cobrar</strong>: Cuenta 1.1.02 (Deudores por venta)</li></ul>',
        tip: 'Si tu contador usa un plan de cuentas diferente, puedes ajustar las asignaciones automáticas en Configuración.',
      },
    ],
    relatedSlugs: ['asientos-contables', 'estados-financieros'],
  },
  {
    slug: 'asientos-contables',
    title: 'Cómo crear asientos contables',
    category: 'contabilidad',
    categoryLabel: 'Contabilidad',
    icon: 'Calculator',
    summary: 'Aprende a crear asientos contables manuales y entiende los asientos automáticos que genera CuentaX.',
    keywords: ['asientos contables', 'libro diario', 'debe', 'haber', 'partida doble', 'contabilidad'],
    sections: [
      {
        title: 'Asientos automáticos',
        content: 'CuentaX genera asientos contables automáticamente cuando:<ul><li><strong>Emites un DTE</strong>: Registra la venta, IVA débito y cuenta por cobrar</li><li><strong>Registras un gasto</strong>: Registra el gasto, IVA crédito y cuenta por pagar</li><li><strong>Registras un pago</strong>: Registra el movimiento de caja o banco</li><li><strong>Generas una liquidación</strong>: Registra sueldos, previsión, impuestos</li></ul><br/>Estos asientos siguen la partida doble: cada transacción tiene un <strong>debe</strong> y un <strong>haber</strong> que suman lo mismo.',
      },
      {
        title: 'Crear asiento manual',
        content: 'Ve a <strong>Contabilidad > Libro Diario</strong> y haz clic en "Nuevo Asiento":<ul><li><strong>Fecha</strong>: Fecha contable del asiento</li><li><strong>Glosa</strong>: Descripción de la operación</li><li><strong>Líneas</strong>: Agrega las líneas del asiento indicando cuenta, debe, haber y detalle</li><li>El sistema valida que el total del debe sea igual al total del haber</li><li>Haz clic en "Guardar" para registrar el asiento</li></ul>',
        warning: 'Un asiento descuadrado (donde debe y haber no coinciden) no se puede guardar. Revisa las cifras antes de intentar guardar.',
      },
      {
        title: 'Asientos de ajuste',
        content: 'Los asientos de ajuste son necesarios al cierre de cada período para:<ul><li><strong>Depreciación</strong>: Registro de la depreciación de activos fijos</li><li><strong>Provisiones</strong>: Vacaciones proporcionales, indemnizaciones</li><li><strong>Corrección monetaria</strong>: Ajuste por inflación según IPC</li><li><strong>Devengamiento</strong>: Ingresos o gastos que corresponden al período pero no se han cobrado/pagado</li></ul>',
      },
    ],
    relatedSlugs: ['plan-cuentas', 'estados-financieros'],
  },
  {
    slug: 'estados-financieros',
    title: 'Balance General y Estado de Resultados',
    category: 'contabilidad',
    categoryLabel: 'Contabilidad',
    icon: 'Calculator',
    summary: 'Genera y consulta tus estados financieros: Balance General, Estado de Resultados y otros reportes contables.',
    keywords: ['balance general', 'estado de resultados', 'EERR', 'estados financieros', 'patrimonio', 'utilidad'],
    sections: [
      {
        title: 'Balance General',
        content: 'El Balance General muestra la <strong>situación financiera</strong> de tu empresa en una fecha determinada:<ul><li><strong>Activos</strong>: Lo que la empresa tiene (caja, cuentas por cobrar, equipos, propiedades)</li><li><strong>Pasivos</strong>: Lo que la empresa debe (deudas, proveedores, impuestos)</li><li><strong>Patrimonio</strong>: La diferencia (capital + resultados acumulados)</li></ul><br/>La ecuación contable siempre se cumple: <strong>Activos = Pasivos + Patrimonio</strong>.<br/><br/>Ve a <strong>Contabilidad > Balance General</strong> para generarlo.',
      },
      {
        title: 'Estado de Resultados',
        content: 'El Estado de Resultados muestra las <strong>ganancias o pérdidas</strong> de un período:<ul><li><strong>Ingresos</strong>: Ventas netas y otros ingresos</li><li><strong>Costos</strong>: Costo de la mercadería o servicios vendidos</li><li><strong>Margen bruto</strong>: Ingresos - Costos</li><li><strong>Gastos operacionales</strong>: Administración, ventas, marketing</li><li><strong>Resultado operacional</strong>: Margen bruto - Gastos</li><li><strong>Resultado antes de impuestos</strong>: Incluye ingresos y gastos financieros</li><li><strong>Impuesto a la renta</strong>: Tasa actual del 27% (régimen general)</li><li><strong>Utilidad (o pérdida) neta</strong>: Resultado final del período</li></ul>',
      },
      {
        title: 'Otros reportes',
        content: 'CuentaX también ofrece:<ul><li><strong>Libro Mayor</strong>: Movimientos por cuenta contable</li><li><strong>Flujo de Caja</strong>: Movimientos de efectivo entrante y saliente</li><li><strong>Centros de Costo</strong>: Resultados agrupados por centro de costo o proyecto</li></ul>',
        tip: 'Genera los estados financieros mensualmente para tener visibilidad constante de la salud financiera de tu empresa.',
      },
    ],
    relatedSlugs: ['plan-cuentas', 'asientos-contables', 'dashboard-kpis'],
  },

  // ═══════════════════════════════════════════════════════════════
  // REMUNERACIONES
  // ═══════════════════════════════════════════════════════════════
  {
    slug: 'liquidaciones',
    title: 'Cómo generar liquidaciones de sueldo',
    category: 'remuneraciones',
    categoryLabel: 'Remuneraciones',
    icon: 'Briefcase',
    summary: 'Genera liquidaciones de sueldo completas con cálculos de AFP, Salud, impuesto único y descuentos legales chilenos.',
    keywords: ['liquidación', 'sueldo', 'remuneración', 'AFP', 'salud', 'isapre', 'fonasa', 'impuesto único'],
    sections: [
      {
        title: 'Estructura de la liquidación',
        content: 'Una liquidación de sueldo en Chile incluye:<ul><li><strong>Haberes imponibles</strong>: Sueldo base, gratificación, bonos imponibles</li><li><strong>Haberes no imponibles</strong>: Colación, movilización, viáticos</li><li><strong>Descuentos previsionales</strong>: AFP (tasa según la AFP del trabajador, ~11-12%), Salud (7% para Fonasa, o el plan pactado para Isapre), Seguro de Cesantía</li><li><strong>Impuesto Único</strong>: Se calcula sobre la renta imponible según la tabla del SII (tramos de 0% a 40%)</li><li><strong>Otros descuentos</strong>: Préstamos, anticipos, cuotas sindicales</li><li><strong>Líquido a pagar</strong>: Lo que recibe el trabajador</li></ul>',
      },
      {
        title: 'Generar una liquidación',
        content: 'Ve a <strong>Remuneraciones > Liquidaciones</strong> y haz clic en "Nueva Liquidación":<ul><li>Selecciona el <strong>empleado</strong> y el <strong>mes</strong> a liquidar</li><li>Los datos base (sueldo, AFP, salud) se toman del contrato</li><li>Agrega o modifica <strong>haberes extras</strong> (horas extra, bonos, comisiones)</li><li>Agrega <strong>descuentos</strong> si corresponde</li><li>CuentaX calcula automáticamente todos los descuentos legales</li><li>Revisa y haz clic en "Generar"</li></ul>',
        tip: 'Puedes generar liquidaciones masivas para todos los empleados del período desde la sección "Nóminas".',
      },
      {
        title: 'Indicadores previsionales',
        content: 'CuentaX se actualiza automáticamente con los indicadores vigentes:<ul><li><strong>UF</strong>: Unidad de Fomento (actualizada diariamente)</li><li><strong>UTM</strong>: Unidad Tributaria Mensual</li><li><strong>Tope imponible AFP</strong>: Monto máximo para cotización</li><li><strong>Tope imponible Salud</strong>: Monto máximo para cotización</li><li><strong>Seguro de Cesantía</strong>: Tasas de trabajador y empleador</li><li><strong>Sueldo mínimo</strong>: Ingreso Mínimo Mensual vigente</li></ul>',
        warning: 'Verifica que los indicadores estén actualizados antes de generar liquidaciones. Usa la sección "Indicadores" para consultar los valores vigentes.',
      },
    ],
    relatedSlugs: ['portal-trabajador', 'plan-cuentas'],
  },
  {
    slug: 'portal-trabajador',
    title: 'El Portal del Trabajador',
    category: 'remuneraciones',
    categoryLabel: 'Remuneraciones',
    icon: 'Briefcase',
    summary: 'Cómo los trabajadores pueden acceder a sus liquidaciones, certificados y datos personales.',
    keywords: ['portal trabajador', 'empleado', 'liquidación', 'certificado', 'autoservicio'],
    sections: [
      {
        title: '¿Qué es el Portal del Trabajador?',
        content: 'El Portal del Trabajador es una vista de autoservicio donde cada empleado puede acceder a:<ul><li><strong>Liquidaciones de sueldo</strong>: Historial completo de liquidaciones en PDF</li><li><strong>Certificado de antigüedad</strong>: Documento que acredita la relación laboral</li><li><strong>Certificado de remuneraciones</strong>: Resumen de sueldos para trámites bancarios o legales</li><li><strong>Datos personales</strong>: Nombre, RUT, dirección, datos bancarios</li><li><strong>Vacaciones</strong>: Días disponibles, historial de vacaciones</li></ul>',
      },
      {
        title: 'Acceso al portal',
        content: 'Cada trabajador recibe un <strong>enlace de acceso</strong> por email. El acceso es con su RUT y una clave que define al registrarse.<br/><br/>Como empleador, puedes:<ul><li>Enviar invitaciones al portal desde la ficha del empleado</li><li>Configurar qué información es visible para el trabajador</li><li>Revocar el acceso en cualquier momento</li></ul>',
        tip: 'El portal del trabajador reduce las consultas al área de RRHH, ya que los empleados pueden descargar sus documentos directamente.',
      },
    ],
    relatedSlugs: ['liquidaciones'],
  },

  // ═══════════════════════════════════════════════════════════════
  // BANCO
  // ═══════════════════════════════════════════════════════════════
  {
    slug: 'cuentas-bancarias',
    title: 'Cómo configurar cuentas bancarias',
    category: 'banco',
    categoryLabel: 'Banco',
    icon: 'Landmark',
    summary: 'Configura tus cuentas bancarias en CuentaX para registrar transacciones y hacer conciliación bancaria.',
    keywords: ['cuenta bancaria', 'banco', 'configurar', 'cuenta corriente', 'cuenta vista'],
    sections: [
      {
        title: 'Agregar una cuenta bancaria',
        content: 'Ve a <strong>Banco > Cuentas</strong> y haz clic en "Nueva Cuenta":<ul><li><strong>Banco</strong>: Selecciona el banco (BancoEstado, Santander, BCI, Scotiabank, etc.)</li><li><strong>Tipo de cuenta</strong>: Cuenta Corriente, Cuenta Vista, Cuenta de Ahorro</li><li><strong>Número de cuenta</strong>: El número oficial de la cuenta</li><li><strong>Moneda</strong>: CLP (pesos chilenos) por defecto, o USD, UF</li><li><strong>Saldo inicial</strong>: El saldo a la fecha de inicio del registro</li></ul>',
      },
      {
        title: 'Registrar transacciones',
        content: 'Puedes registrar movimientos bancarios de dos formas:<ul><li><strong>Manual</strong>: Ingresa cada transacción con fecha, monto, descripción y categoría</li><li><strong>Importar cartola</strong>: Sube el archivo de cartola bancaria (formato CSV o Excel) y CuentaX importa las transacciones automáticamente</li></ul>',
        tip: 'Descarga la cartola de tu banco en formato CSV. La mayoría de los bancos chilenos ofrecen esta opción en su banca en línea.',
      },
      {
        title: 'Múltiples cuentas',
        content: 'CuentaX permite manejar múltiples cuentas bancarias. Esto es útil si tu empresa tiene:<ul><li>Cuenta corriente operacional</li><li>Cuenta para pagos de remuneraciones</li><li>Cuenta de ahorro o inversiones</li><li>Cuentas en diferentes bancos</li></ul><br/>El dashboard muestra el saldo consolidado de todas las cuentas.',
      },
    ],
    relatedSlugs: ['conciliacion', 'asientos-contables'],
  },
  {
    slug: 'conciliacion',
    title: 'Conciliación bancaria',
    category: 'banco',
    categoryLabel: 'Banco',
    icon: 'Landmark',
    summary: 'Aprende a conciliar tus movimientos bancarios con los registros contables de CuentaX.',
    keywords: ['conciliación', 'bancaria', 'cartola', 'cuadrar', 'saldo', 'diferencias'],
    sections: [
      {
        title: '¿Qué es la conciliación bancaria?',
        content: 'La conciliación bancaria es el proceso de <strong>verificar que los registros de tu banco coincidan con tu contabilidad</strong>. Es fundamental para:<ul><li>Detectar errores en los registros</li><li>Identificar transacciones no registradas</li><li>Verificar que no haya cobros o cargos indebidos</li><li>Mantener la contabilidad al día</li></ul>',
      },
      {
        title: 'Proceso en CuentaX',
        content: 'Ve a <strong>Contabilidad > Conciliación</strong>:<ul><li>Selecciona la <strong>cuenta bancaria</strong> y el <strong>período</strong></li><li>El sistema muestra tus transacciones registradas y las de la cartola lado a lado</li><li>Las transacciones que coinciden se <strong>vinculan automáticamente</strong></li><li>Las que no coinciden se marcan como <strong>pendientes de conciliar</strong></li><li>Puedes vincular manualmente o crear el registro faltante</li></ul>',
        tip: 'Haz la conciliación al menos una vez al mes. Mientras más frecuente, más fácil es detectar y corregir diferencias.',
      },
      {
        title: 'Diferencias comunes',
        content: 'Las diferencias típicas entre banco y contabilidad son:<ul><li><strong>Cheques girados no cobrados</strong>: Registrado en la contabilidad pero no en el banco</li><li><strong>Depósitos en tránsito</strong>: Depositados pero no reflejados aún en la cartola</li><li><strong>Comisiones bancarias</strong>: Cargos del banco no registrados en la contabilidad</li><li><strong>Transferencias no registradas</strong>: Pagos o cobros que olvidaste registrar</li></ul>',
      },
    ],
    relatedSlugs: ['cuentas-bancarias', 'asientos-contables', 'plan-cuentas'],
  },

  // ═══════════════════════════════════════════════════════════════
  // HERRAMIENTAS
  // ═══════════════════════════════════════════════════════════════
  {
    slug: 'certificacion-sii',
    title: 'Proceso de certificación ante el SII',
    category: 'herramientas',
    categoryLabel: 'Herramientas',
    icon: 'Settings',
    summary: 'Entiende el proceso de certificación como emisor de documentos tributarios electrónicos ante el SII.',
    keywords: ['certificación', 'SII', 'DTE', 'maullin', 'ambiente certificación', 'producción', 'homologación'],
    sections: [
      {
        title: '¿Qué es la certificación?',
        content: 'La certificación ante el SII es el proceso mediante el cual tu empresa se <strong>habilita para emitir documentos tributarios electrónicos</strong>. Es un proceso de <strong>homologación</strong> donde el SII verifica que tu sistema puede generar DTEs correctos.<br/><br/>El proceso se realiza en el ambiente de <strong>certificación</strong> (maullin.sii.cl), que es un ambiente de pruebas separado del de producción.',
      },
      {
        title: 'Etapas de la certificación',
        content: 'El proceso tiene varias etapas:<ul><li><strong>Set de pruebas</strong>: Debes emitir un conjunto específico de documentos de prueba que el SII te asigna</li><li><strong>Envío de documentos</strong>: Los documentos se envían al ambiente de certificación</li><li><strong>Validación del SII</strong>: El SII verifica que los documentos cumplan con el schema XML y la normativa</li><li><strong>Simulación de intercambio</strong>: Prueba de recepción y acuse de recibo</li><li><strong>Aprobación</strong>: Si todo está correcto, el SII autoriza tu empresa para operar en producción</li></ul>',
        warning: 'La certificación puede tomar desde unos días hasta varias semanas dependiendo de la rapidez con que se corrijan los errores. CuentaX automatiza gran parte del proceso.',
      },
      {
        title: 'Estado en CuentaX',
        content: 'CuentaX muestra el <strong>ambiente actual</strong> en la barra lateral:<ul><li><strong>CERT</strong> (amarillo): Estás en ambiente de certificación (pruebas)</li><li><strong>PRODUCCION</strong> (verde): Estás habilitado para emitir documentos reales</li></ul><br/>Ve a <strong>Herramientas > Certificación SII</strong> para ver el avance de tu proceso de certificación y los pasos pendientes.',
        tip: 'Si ya estás certificado en producción, no necesitas hacer nada más. CuentaX te indica automáticamente en qué ambiente estás operando.',
      },
    ],
    relatedSlugs: ['certificado-digital', 'configuracion-empresa', 'que-son-cafs'],
  },
  {
    slug: 'configuracion-empresa',
    title: 'Configuración de la empresa',
    category: 'herramientas',
    categoryLabel: 'Herramientas',
    icon: 'Settings',
    summary: 'Configura todos los datos de tu empresa: logo, datos tributarios, datos bancarios y preferencias.',
    keywords: ['configuración', 'empresa', 'logo', 'datos', 'RUT', 'razón social', 'giro'],
    sections: [
      {
        title: 'Datos tributarios',
        content: 'Ve a <strong>Mi Empresa</strong> en la barra lateral para configurar:<ul><li><strong>RUT</strong>: RUT de la empresa (no modificable después de crear)</li><li><strong>Razón Social</strong>: Nombre legal tal como aparece en el SII</li><li><strong>Nombre de Fantasía</strong>: Nombre comercial (opcional)</li><li><strong>Giro</strong>: Actividad económica registrada en el SII (código Acteco)</li><li><strong>Dirección, Comuna, Ciudad</strong>: Domicilio comercial</li><li><strong>Teléfono y Email</strong>: Datos de contacto</li></ul>',
        warning: 'La razón social y el giro deben coincidir EXACTAMENTE con lo registrado en el SII. Diferencias pueden causar rechazo de documentos.',
      },
      {
        title: 'Logo y personalización',
        content: 'Puedes personalizar la apariencia de tus documentos:<ul><li><strong>Logo de la empresa</strong>: Se incluirá en la representación impresa de los DTEs</li><li><strong>Texto personalizado</strong>: Mensaje al pie de los documentos</li><li><strong>Datos bancarios</strong>: Cuenta para transferencias (se muestra en facturas)</li></ul>',
        tip: 'El logo se recomienda en formato PNG con fondo transparente y una resolución mínima de 300x100 píxeles.',
      },
      {
        title: 'Configuración del SII',
        content: 'En <strong>Config. SII</strong> puedes gestionar:<ul><li><strong>Certificado digital</strong>: Subir, renovar o cambiar el certificado</li><li><strong>Ambiente</strong>: Ver si estás en certificación o producción</li><li><strong>Resolución SII</strong>: Número y fecha de resolución que te autoriza como emisor electrónico</li><li><strong>Folios (CAFs)</strong>: Ver estado y solicitar nuevos rangos</li></ul>',
      },
    ],
    relatedSlugs: ['certificado-digital', 'certificacion-sii', 'como-empezar'],
  },

  // ═══════════════════════════════════════════════════════════════
  // FAQ
  // ═══════════════════════════════════════════════════════════════
  {
    slug: 'faq',
    title: 'Preguntas frecuentes sobre CuentaX',
    category: 'faq',
    categoryLabel: 'Preguntas Frecuentes',
    icon: 'HelpCircle',
    summary: '20 preguntas frecuentes sobre CuentaX, tributación chilena, emisión de documentos y contabilidad.',
    keywords: ['FAQ', 'preguntas frecuentes', 'dudas', 'ayuda', 'soporte', 'problemas'],
    sections: [
      {
        title: 'Sobre CuentaX',
        content: '<ul><li><strong>¿Qué es CuentaX?</strong><br/>CuentaX es una plataforma de contabilidad y facturación electrónica diseñada para empresas chilenas. Permite emitir DTEs, llevar contabilidad, gestionar remuneraciones y más, todo desde una interfaz moderna y fácil de usar.</li><br/><li><strong>¿CuentaX reemplaza a mi contador?</strong><br/>No. CuentaX es una herramienta que facilita el trabajo contable y tributario, pero la supervisión de un contador público autorizado sigue siendo recomendada, especialmente para declaraciones anuales y situaciones complejas.</li><br/><li><strong>¿Puedo usar CuentaX desde el celular?</strong><br/>Sí. CuentaX es una Progressive Web App (PWA) que funciona en cualquier navegador moderno, incluyendo celulares y tablets. Puedes instalarla como app en tu dispositivo.</li><br/><li><strong>¿Cuántas empresas puedo manejar?</strong><br/>Puedes crear y administrar múltiples empresas desde una sola cuenta de CuentaX. Cambia entre ellas con el selector de empresa en la barra lateral.</li><br/><li><strong>¿Mis datos están seguros?</strong><br/>Sí. CuentaX utiliza encriptación de datos en tránsito (HTTPS/TLS) y en reposo. Los certificados digitales se almacenan de forma encriptada. Realizamos respaldos automáticos diarios.</li></ul>',
      },
      {
        title: 'Sobre emisión de documentos',
        content: '<ul><li><strong>¿Cuánto demora en aceptarse un documento?</strong><br/>Normalmente el SII acepta o rechaza un documento en segundos. En horarios de alta demanda puede tomar hasta unos minutos.</li><br/><li><strong>¿Qué hago si un documento es rechazado?</strong><br/>Revisa el motivo del rechazo en la vista del documento. Los motivos más comunes son: folios vencidos, RUT inválido, montos descuadrados o errores en el XML. Corrige y vuelve a emitir.</li><br/><li><strong>¿Puedo anular una factura ya aceptada?</strong><br/>No puedes eliminar una factura aceptada por el SII. Debes emitir una Nota de Crédito (Tipo 61) referenciando la factura original.</li><br/><li><strong>¿Puedo emitir facturas exentas?</strong><br/>Sí. Selecciona "Factura Exenta (34)" al emitir. Se usa para ventas exentas de IVA según la normativa.</li><br/><li><strong>¿Puedo emitir facturas en dólares?</strong><br/>Los DTEs en Chile son siempre en pesos chilenos (CLP). Puedes indicar el monto en otra moneda como referencia, pero los montos tributarios son en CLP.</li></ul>',
      },
      {
        title: 'Sobre tributación',
        content: '<ul><li><strong>¿Cuándo debo declarar el F29?</strong><br/>El F29 se declara mensualmente antes del día 12 del mes siguiente. Si el día 12 cae en fin de semana o feriado, el plazo se extiende al siguiente día hábil.</li><br/><li><strong>¿Qué pasa si no declaro a tiempo?</strong><br/>El SII aplica multas (hasta 30% del impuesto adeudado) más intereses (1.5% mensual). Es importante declarar dentro del plazo.</li><br/><li><strong>¿Qué es el PPM?</strong><br/>El Pago Provisional Mensual es un anticipo del Impuesto a la Renta que se paga mensualmente como porcentaje de las ventas. Se regulariza en la Declaración Anual (Operación Renta en abril).</li><br/><li><strong>¿Cuál es la tasa de IVA en Chile?</strong><br/>La tasa general de IVA es del 19%. Aplica a la mayoría de las ventas de bienes y servicios.</li><br/><li><strong>¿Qué es el régimen ProPyme?</strong><br/>Es un régimen tributario simplificado para pequeñas y medianas empresas con ingresos anuales de hasta 75.000 UF. Tiene una tasa de impuesto del 25% y permite tributar en base a flujos de caja (cash basis).</li></ul>',
      },
      {
        title: 'Sobre soporte y problemas',
        content: '<ul><li><strong>¿Cómo contacto al soporte?</strong><br/>Puedes usar el Asistente IA integrado para resolver dudas inmediatas, o escribir a soporte@cuentax.cl para problemas más complejos.</li><br/><li><strong>¿Qué hago si el SII muestra "Sin conexión"?</strong><br/>Verifica que tu certificado digital esté vigente. Si lo está, puede ser un problema temporal del SII. Intenta nuevamente en unos minutos.</li><br/><li><strong>¿Puedo importar datos de otro sistema?</strong><br/>Sí. CuentaX permite importar contactos, productos y datos históricos mediante archivos CSV.</li><br/><li><strong>¿Hay una versión de prueba?</strong><br/>CuentaX ofrece un período de prueba gratuito en ambiente de certificación para que puedas evaluar todas las funcionalidades antes de pasar a producción.</li><br/><li><strong>¿CuentaX funciona offline?</strong><br/>Algunas funciones básicas de consulta están disponibles offline gracias a la tecnología PWA. Sin embargo, para emitir documentos se requiere conexión a internet ya que deben enviarse al SII.</li></ul>',
      },
    ],
    relatedSlugs: ['como-empezar', 'usar-asistente'],
  },

  // ═══════════════════════════════════════════════════════════════
  // ASISTENTE IA
  // ═══════════════════════════════════════════════════════════════
  {
    slug: 'usar-asistente',
    title: 'Cómo usar el Asistente Inteligente de CuentaX',
    category: 'asistente',
    categoryLabel: 'Asistente IA',
    icon: 'Sparkles',
    summary: 'Descubre cómo el asistente de inteligencia artificial de CuentaX puede ayudarte con consultas contables, tributarias y de uso del sistema.',
    keywords: ['asistente', 'IA', 'inteligencia artificial', 'chat', 'ayuda', 'consulta', 'bot'],
    sections: [
      {
        title: '¿Qué puede hacer el Asistente?',
        content: 'El Asistente IA de CuentaX está entrenado en contabilidad y tributación chilena. Puede ayudarte con:<ul><li><strong>Consultas tributarias</strong>: "¿Cuándo vence el F29?", "¿Cómo calculo el PPM?"</li><li><strong>Uso del sistema</strong>: "¿Cómo emito una nota de crédito?", "¿Dónde veo mis folios?"</li><li><strong>Interpretación de datos</strong>: "¿Por qué mi IVA estimado es tan alto este mes?"</li><li><strong>Normativa SII</strong>: "¿Qué documentos necesito para certificarme?"</li></ul>',
      },
      {
        title: 'Cómo acceder',
        content: 'El asistente está disponible desde el <strong>ícono de chat</strong> en la esquina inferior derecha de la pantalla. Haz clic para abrir la ventana de conversación y escribe tu pregunta en español.<br/><br/>El asistente responde en tiempo real y puede guiarte paso a paso para resolver cualquier situación.',
        tip: 'Sé específico en tus preguntas. "¿Cómo emito una NC por error en el monto?" dará mejor respuesta que "ayuda con nota de crédito".',
      },
      {
        title: 'Limitaciones',
        content: 'El asistente es una herramienta de apoyo con algunas limitaciones:<ul><li>No reemplaza la asesoría de un <strong>contador profesional</strong> para situaciones complejas</li><li>No puede ejecutar acciones por ti (emitir documentos, crear contactos)</li><li>Su conocimiento tributario es general; para casos muy específicos consulta con tu contador</li><li>No tiene acceso a los datos específicos de tu empresa por motivos de privacidad</li></ul>',
        warning: 'Las respuestas del asistente son orientativas. Para decisiones tributarias importantes, confirma siempre con un profesional contable.',
      },
    ],
    relatedSlugs: ['faq', 'como-empezar'],
  },
]

// ── Helper: get articles by category ────────────────────────────
export function getArticlesByCategory(category: string): HelpArticle[] {
  return HELP_ARTICLES.filter(a => a.category === category)
}

// ── Helper: get article by slug ─────────────────────────────────
export function getArticleBySlug(slug: string): HelpArticle | undefined {
  return HELP_ARTICLES.find(a => a.slug === slug)
}

// ── Helper: get related articles ────────────────────────────────
export function getRelatedArticles(article: HelpArticle): HelpArticle[] {
  if (!article.relatedSlugs) return []
  return article.relatedSlugs
    .map(slug => HELP_ARTICLES.find(a => a.slug === slug))
    .filter((a): a is HelpArticle => a !== undefined)
}

// ── Popular articles (curated) ──────────────────────────────────
export const POPULAR_SLUGS = [
  'como-empezar',
  'emitir-factura',
  'emitir-boleta',
  'escanear-boleta',
  'que-son-cafs',
  'f29-estimado',
  'faq',
  'usar-asistente',
]

export function getPopularArticles(): HelpArticle[] {
  return POPULAR_SLUGS
    .map(slug => HELP_ARTICLES.find(a => a.slug === slug))
    .filter((a): a is HelpArticle => a !== undefined)
}
