/**
 * CUENTAX -- Contract PDF Generator
 * ==================================
 * Generates Chilean employment contracts (Contrato de Trabajo) as PDF documents.
 * Supports indefinido, plazo fijo, and obra/faena contract types.
 * Uses PDFKit for layout and rendering.
 */

import PDFDocument from 'pdfkit'

// -- Types ------------------------------------------------------------------

export interface ContractPDFData {
  // Company
  company_name: string
  company_rut: string
  company_address: string
  company_commune: string
  company_city: string
  company_email: string
  company_logo?: string // base64
  rep_legal_name: string
  rep_legal_rut: string

  // Employee
  employee_name: string
  employee_rut: string
  employee_nationality: string
  employee_marital: string
  employee_birthday: string
  employee_address: string
  employee_commune: string
  employee_email: string
  employee_phone: string
  employee_afp: string
  employee_health: string // "Fonasa" or "Isapre Cruz Blanca Plan UF 2.641"

  // Contract
  contract_type: 'indefinido' | 'plazo_fijo' | 'obra_faena'
  start_date: string
  end_date?: string
  job_title: string
  jornada: string // "completa" | "art22" | custom description
  wage: number
  colacion: number
  movilizacion: number
  jurisdiction_commune: string
}

// -- Helpers ----------------------------------------------------------------

const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

function formatDateLong(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  const day = d.getDate()
  const month = MONTHS[d.getMonth()]
  const year = d.getFullYear()
  return `${day} de ${month} de ${year}`
}

function formatCLP(amount: number): string {
  const formatted = Math.round(amount)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `$${formatted}.-`
}

function numberToWords(n: number): string {
  const units = [
    '', 'un', 'dos', 'tres', 'cuatro', 'cinco',
    'seis', 'siete', 'ocho', 'nueve', 'diez',
    'once', 'doce', 'trece', 'catorce', 'quince',
    'dieciseis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte',
  ]
  const tens = [
    '', '', 'veinti', 'treinta', 'cuarenta', 'cincuenta',
    'sesenta', 'setenta', 'ochenta', 'noventa',
  ]
  const hundreds = [
    '', 'cien', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos',
    'seiscientos', 'setecientos', 'ochocientos', 'novecientos',
  ]

  if (n === 0) return 'cero'
  if (n <= 20) return units[n]
  if (n < 30) return `veinti${units[n % 10]}`
  if (n < 100) {
    const t = Math.floor(n / 10)
    const u = n % 10
    return u === 0 ? tens[t] : `${tens[t]} y ${units[u]}`
  }
  if (n < 1000) {
    const h = Math.floor(n / 100)
    const rest = n % 100
    if (n === 100) return 'cien'
    return rest === 0 ? hundreds[h] : `${hundreds[h]}to ${numberToWords(rest)}`
  }
  if (n < 1000000) {
    const thousands = Math.floor(n / 1000)
    const rest = n % 1000
    const prefix = thousands === 1 ? 'mil' : `${numberToWords(thousands)} mil`
    return rest === 0 ? prefix : `${prefix} ${numberToWords(rest)}`
  }
  const millions = Math.floor(n / 1000000)
  const rest = n % 1000000
  const prefix = millions === 1 ? 'un millon' : `${numberToWords(millions)} millones`
  return rest === 0 ? prefix : `${prefix} ${numberToWords(rest)}`
}

function contractTypeLabel(type: ContractPDFData['contract_type']): string {
  switch (type) {
    case 'indefinido':
      return 'INDEFINIDO'
    case 'plazo_fijo':
      return 'PLAZO FIJO'
    case 'obra_faena':
      return 'POR OBRA O FAENA'
  }
}

// -- PDF Generator ----------------------------------------------------------

export async function generateContractPDF(data: ContractPDFData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []

    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 72, bottom: 72, left: 72, right: 72 },
      info: {
        Title: `Contrato de Trabajo - ${data.employee_name}`,
        Author: data.company_name,
        Subject: 'Contrato de Trabajo',
      },
    })

    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const PAGE_WIDTH = 595.28 // A4 width in points
    const CONTENT_WIDTH = PAGE_WIDTH - 72 - 72 // margins
    const LEFT = 72

    // -- Fonts --
    const FONT_REGULAR = 'Helvetica'
    const FONT_BOLD = 'Helvetica-Bold'

    // -- Company header --
    let headerY = 72

    if (data.company_logo) {
      try {
        const logoBuffer = Buffer.from(data.company_logo, 'base64')
        doc.image(logoBuffer, LEFT, headerY, { width: 80, height: 80 })
        doc.font(FONT_BOLD).fontSize(12)
        doc.text(data.company_name, LEFT + 95, headerY + 10)
        doc.font(FONT_REGULAR).fontSize(9)
        doc.text(data.company_address, LEFT + 95, headerY + 28)
        doc.text(`${data.company_commune}, ${data.company_city}`, LEFT + 95, headerY + 40)
        headerY += 90
      } catch {
        // If logo fails, render text-only header
        doc.font(FONT_BOLD).fontSize(12)
        doc.text(data.company_name, LEFT, headerY)
        doc.font(FONT_REGULAR).fontSize(9)
        doc.text(data.company_address, LEFT, headerY + 18)
        doc.text(`${data.company_commune}, ${data.company_city}`, LEFT, headerY + 30)
        headerY += 50
      }
    } else {
      doc.font(FONT_BOLD).fontSize(12)
      doc.text(data.company_name, LEFT, headerY)
      doc.font(FONT_REGULAR).fontSize(9)
      doc.text(data.company_address, LEFT, headerY + 18)
      doc.text(`${data.company_commune}, ${data.company_city}`, LEFT, headerY + 30)
      headerY += 50
    }

    // -- Title --
    headerY += 15
    doc.font(FONT_BOLD).fontSize(14)
    doc.text(
      `CONTRATO DE TRABAJO ${contractTypeLabel(data.contract_type)}`,
      LEFT,
      headerY,
      { align: 'center', width: CONTENT_WIDTH },
    )
    headerY += 25

    doc.font(FONT_REGULAR).fontSize(10)
    doc.text(
      `${data.company_city}, ${formatDateLong(data.start_date)}`,
      LEFT,
      headerY,
      { align: 'center', width: CONTENT_WIDTH },
    )
    headerY += 30

    // -- Helper: section header with line --
    function sectionHeader(title: string, y: number): number {
      doc.font(FONT_BOLD).fontSize(11)
      doc.text(title, LEFT, y)
      const lineY = y + 16
      doc.moveTo(LEFT, lineY).lineTo(LEFT + CONTENT_WIDTH, lineY).lineWidth(0.5).stroke('#333333')
      return lineY + 8
    }

    // -- Helper: key-value row --
    function kvRow(label: string, value: string, y: number): number {
      const LABEL_WIDTH = 130
      doc.font(FONT_BOLD).fontSize(10)
      doc.text(label, LEFT, y, { width: LABEL_WIDTH })
      doc.font(FONT_REGULAR).fontSize(10)
      doc.text(`: ${value}`, LEFT + LABEL_WIDTH, y, { width: CONTENT_WIDTH - LABEL_WIDTH })
      return y + 15
    }

    // -- Helper: page break check --
    function ensureSpace(needed: number): void {
      if (doc.y + needed > 770) {
        doc.addPage()
      }
    }

    // -- INDIVIDUALIZACION EMPLEADOR --
    let y = sectionHeader('INDIVIDUALIZACION EMPLEADOR', headerY)
    y = kvRow('Razon Social', data.company_name, y)
    y = kvRow('RUT', data.company_rut, y)
    y = kvRow('Rep. Legal', data.rep_legal_name, y)
    y = kvRow('R.U.T.', data.rep_legal_rut, y)
    y = kvRow('Direccion', data.company_address, y)
    y = kvRow('Comuna', data.company_commune, y)
    y = kvRow('Ciudad', data.company_city, y)
    y = kvRow('Correo', data.company_email, y)
    y += 15

    // -- INDIVIDUALIZACION TRABAJADOR --
    y = sectionHeader('INDIVIDUALIZACION TRABAJADOR', y)
    y = kvRow('Nombre', data.employee_name, y)
    y = kvRow('C. de Identidad', data.employee_rut, y)
    y = kvRow('Nacionalidad', data.employee_nationality, y)
    y = kvRow('Estado Civil', data.employee_marital, y)
    y = kvRow('Fecha Nacimiento', formatDateLong(data.employee_birthday), y)
    y = kvRow('Domicilio', data.employee_address, y)
    y = kvRow('Comuna', data.employee_commune, y)
    y = kvRow('A.F.P.', data.employee_afp, y)
    y = kvRow('Sistema Salud', data.employee_health, y)
    y = kvRow('Correo', data.employee_email, y)
    y = kvRow('Telefono', data.employee_phone, y)
    y = kvRow('Fecha Ingreso', formatDateLong(data.start_date), y)
    y += 20

    // -- Helper: clause paragraph --
    function clause(ordinal: string, text: string): void {
      ensureSpace(60)
      doc.font(FONT_BOLD).fontSize(10)
      doc.text(`${ordinal}: `, LEFT, doc.y, { continued: true })
      doc.font(FONT_REGULAR).fontSize(10)
      doc.text(text, { width: CONTENT_WIDTH, align: 'justify', lineGap: 2 })
      doc.moveDown(0.8)
    }

    // Move cursor to y
    doc.y = y

    // -- PRIMERO: Cargo --
    clause(
      'PRIMERO',
      `El/la trabajador/a se obliga a prestar sus servicios personales y habituales para ${data.company_name}, en el cargo de ${data.job_title}, debiendo realizar todas las funciones inherentes a dicho cargo, asi como aquellas que le encomiende su jefe directo o la empresa, siempre que esten relacionadas con la naturaleza de sus servicios.`,
    )

    // -- SEGUNDO: Territorio --
    clause(
      'SEGUNDO',
      `Las partes comparecientes acuerdan expresamente que el/la trabajador/a solo prestara los servicios senalados en este contrato y dentro de los limites territoriales que comprenden la actividad del Empleador. El lugar de prestacion de servicios sera en las dependencias de ${data.company_name}, ubicadas en ${data.company_address}, comuna de ${data.company_commune}, ${data.company_city}, sin perjuicio de que pueda ser trasladado/a a otras dependencias de la empresa dentro de la misma ciudad.`,
    )

    // -- TERCERO: Jornada --
    const jornadaNorm = data.jornada.toLowerCase().trim()
    let jornadaText: string

    if (jornadaNorm === 'art22' || jornadaNorm === 'articulo 22') {
      jornadaText =
        `Se deja constancia que el/la trabajador/a, en atencion a la naturaleza de las funciones que desempenara y en conformidad a lo dispuesto por el articulo 22, inciso 2 del Codigo del Trabajo, se encuentra excluido/a de la limitacion en la jornada de trabajo. Lo anterior no obsta a que el/la trabajador/a deba cumplir con las metas y objetivos que le sean fijados por la empresa.`
    } else {
      jornadaText =
        `La jornada de trabajo sera de 45 horas semanales, distribuidas de lunes a viernes, en el siguiente horario: de 09:00 a 18:00 horas, con un descanso de 60 minutos para colacion entre las 13:00 y las 14:00 horas, tiempo que no se considerara trabajado para computar la duracion de la jornada diaria. El/la trabajador/a no podra trabajar horas extraordinarias sin autorizacion previa y por escrito de su empleador.`
    }

    clause('TERCERO', jornadaText)

    // -- CUARTO: Remuneraciones --
    const totalHaber = data.wage + data.colacion + data.movilizacion
    const wageWords = numberToWords(data.wage)

    ensureSpace(100)
    doc.font(FONT_BOLD).fontSize(10)
    doc.text('CUARTO: ', LEFT, doc.y, { continued: true })
    doc.font(FONT_REGULAR).fontSize(10)
    doc.text(
      'El empleador se compromete a remunerar al/la trabajador/a con los siguientes haberes mensuales:',
      { width: CONTENT_WIDTH, align: 'justify', lineGap: 2 },
    )
    doc.moveDown(0.5)

    // Remuneration table
    const COL1 = LEFT + 30
    const COL2 = LEFT + CONTENT_WIDTH - 120
    const rowHeight = 18

    function remuRow(label: string, amount: number): void {
      doc.font(FONT_REGULAR).fontSize(10)
      doc.text(label, COL1, doc.y, { width: 250 })
      const savedY = doc.y - 12
      doc.text(formatCLP(amount), COL2, savedY, { width: 120, align: 'right' })
    }

    remuRow('Sueldo Base Mensual', data.wage)
    doc.moveDown(0.2)
    remuRow('Asignacion de Colacion', data.colacion)
    doc.moveDown(0.2)
    remuRow('Asignacion de Movilizacion', data.movilizacion)
    doc.moveDown(0.3)

    // Separator line
    doc.moveTo(COL1, doc.y).lineTo(COL2 + 120, doc.y).lineWidth(0.3).stroke('#666666')
    doc.moveDown(0.3)

    doc.font(FONT_BOLD).fontSize(10)
    doc.text('Total Haberes', COL1, doc.y, { width: 250 })
    const totalY = doc.y - 12
    doc.text(formatCLP(totalHaber), COL2, totalY, { width: 120, align: 'right' })
    doc.moveDown(0.8)

    doc.font(FONT_REGULAR).fontSize(10)
    doc.text(
      `El sueldo base mensual asciende a la suma de ${formatCLP(data.wage)} (${wageWords} pesos). Las remuneraciones seran pagadas por el empleador en periodos mensuales vencidos, el ultimo dia habil de cada mes, mediante transferencia bancaria a la cuenta que el/la trabajador/a designe. De las remuneraciones, el empleador deducira los impuestos, las cotizaciones de seguridad social y demas descuentos legales que correspondan.`,
      LEFT,
      doc.y,
      { width: CONTENT_WIDTH, align: 'justify', lineGap: 2 },
    )
    doc.moveDown(0.8)

    // -- QUINTO: Obligaciones --
    clause(
      'QUINTO',
      `El/la trabajador/a se obliga y compromete expresamente a: a) Cumplir fielmente el presente contrato de trabajo y las instrucciones que imparta el empleador; b) Realizar su trabajo con el debido cuidado, evitando comprometer la seguridad y la salud del resto de los trabajadores de la empresa; c) Respetar el Reglamento Interno de Orden, Higiene y Seguridad de la empresa; d) Dar aviso oportuno al empleador de toda ausencia, dentro de las 24 horas siguientes; e) Guardar estricta reserva sobre la informacion de la empresa, clientes, proveedores y toda informacion confidencial a la que tenga acceso.`,
    )

    // -- SEXTO: Prohibiciones --
    clause(
      'SEXTO',
      `Queda estrictamente prohibido al/la trabajador/a: a) Ejecutar durante las horas de trabajo actividades ajenas a sus funciones o negociar dentro del establecimiento; b) Revelar datos e informaciones confidenciales de la empresa a terceros; c) Presentarse al trabajo bajo los efectos del alcohol o drogas; d) Utilizar los recursos de la empresa para fines personales; e) Retirar del establecimiento materiales de trabajo o productos de la empresa sin autorizacion escrita.`,
    )

    // -- SEPTIMO: Duracion --
    let duracionText: string

    switch (data.contract_type) {
      case 'indefinido':
        duracionText =
          `El presente contrato tendra una duracion indefinida, pudiendo cualquiera de las partes ponerle termino conforme a las disposiciones legales vigentes contenidas en el Codigo del Trabajo.`
        break
      case 'plazo_fijo':
        duracionText =
          `El presente contrato tendra una duracion de plazo fijo, comenzando el dia ${formatDateLong(data.start_date)}` +
          (data.end_date ? ` y terminando el dia ${formatDateLong(data.end_date)}` : '') +
          `. El contrato podra renovarse o transformarse en indefinido de acuerdo con las normas del articulo 159 N.4 del Codigo del Trabajo.`
        break
      case 'obra_faena':
        duracionText =
          `El presente contrato de trabajo durara hasta la completa ejecucion de la obra o faena para la cual ha sido contratado/a el/la trabajador/a, esto es, las funciones de ${data.job_title}. Se deja constancia que la naturaleza de los servicios contratados permite calificar este contrato como de obra o faena, en los terminos del articulo 159 N.5 del Codigo del Trabajo.`
        break
    }

    clause('SEPTIMO', duracionText)

    // -- OCTAVO: Fecha de ingreso y domicilio --
    clause(
      'OCTAVO',
      `Se deja constancia que el/la trabajador/a ingreso al servicio del empleador con fecha ${formatDateLong(data.start_date)}. Para todos los efectos derivados del presente contrato, las partes fijan domicilio en la ciudad de ${data.company_city}, comuna de ${data.jurisdiction_commune}.`,
    )

    // -- NOVENO: Modificaciones --
    clause(
      'NOVENO',
      `Toda modificacion al presente contrato debera constar por escrito al dorso del mismo o en un documento anexo, firmado por ambas partes. El presente contrato reemplaza y deja sin efecto cualquier otro anterior, verbal o escrito, que haya existido entre las partes.`,
    )

    // -- DECIMO: Jurisdiccion --
    clause(
      'DECIMO',
      `Para todos los efectos legales derivados del presente contrato, las partes fijan su domicilio en la comuna de ${data.jurisdiction_commune}, ciudad de ${data.company_city}, y se someten a la jurisdiccion de sus tribunales de justicia.`,
    )

    // -- Signatures --
    ensureSpace(120)
    doc.moveDown(2)
    const sigY = doc.y

    const SIG_WIDTH = 180
    const sigLeftX = LEFT + 30
    const sigRightX = LEFT + CONTENT_WIDTH - SIG_WIDTH - 30

    // Lines
    doc.moveTo(sigLeftX, sigY).lineTo(sigLeftX + SIG_WIDTH, sigY).lineWidth(0.5).stroke('#333333')
    doc.moveTo(sigRightX, sigY).lineTo(sigRightX + SIG_WIDTH, sigY).lineWidth(0.5).stroke('#333333')

    // Labels under lines
    doc.font(FONT_BOLD).fontSize(9)
    doc.text('FIRMA EMPLEADOR', sigLeftX, sigY + 5, { width: SIG_WIDTH, align: 'center' })
    doc.text('FIRMA TRABAJADOR/A', sigRightX, sigY + 5, { width: SIG_WIDTH, align: 'center' })

    doc.font(FONT_REGULAR).fontSize(8)
    doc.text(data.rep_legal_name, sigLeftX, sigY + 18, { width: SIG_WIDTH, align: 'center' })
    doc.text(`RUT: ${data.rep_legal_rut}`, sigLeftX, sigY + 28, { width: SIG_WIDTH, align: 'center' })
    doc.text(`p.p. ${data.company_name}`, sigLeftX, sigY + 38, { width: SIG_WIDTH, align: 'center' })

    doc.text(data.employee_name, sigRightX, sigY + 18, { width: SIG_WIDTH, align: 'center' })
    doc.text(`RUT: ${data.employee_rut}`, sigRightX, sigY + 28, { width: SIG_WIDTH, align: 'center' })

    // -- Footer --
    doc.font(FONT_REGULAR).fontSize(7)
    doc.text(
      'El presente contrato se firma en dos ejemplares, quedando uno en poder de cada contratante.',
      LEFT,
      sigY + 60,
      { width: CONTENT_WIDTH, align: 'center' },
    )

    doc.end()
  })
}
