# Copyright 2026 Giraffos
# License LGPL-3.0 or later (https://www.gnu.org/licenses/lgpl).

from odoo import api, fields, models, _
from odoo.exceptions import UserError, ValidationError


class CuentaxCaf(models.Model):
    """CAF - Código de Autorización de Folios from the Chilean SII."""

    _name = "cuentax.caf"
    _description = "Código de Autorización de Folios (CAF)"
    _order = "fecha_carga desc, id desc"

    name = fields.Char(
        string="Nombre",
        compute="_compute_name",
        store=True,
    )
    company_id = fields.Many2one(
        comodel_name="res.company",
        string="Compañía",
        required=True,
        default=lambda self: self.env.company,
    )
    tipo_dte = fields.Selection(
        selection=[
            ("33", "Factura Electrónica"),
            ("34", "Factura No Afecta o Exenta"),
            ("39", "Boleta Electrónica"),
            ("41", "Boleta No Afecta o Exenta"),
            ("52", "Guía de Despacho"),
            ("56", "Nota de Débito"),
            ("61", "Nota de Crédito"),
            ("110", "Factura de Exportación"),
        ],
        string="Tipo DTE",
        required=True,
    )
    folio_desde = fields.Integer(
        string="Folio Desde",
        required=True,
    )
    folio_hasta = fields.Integer(
        string="Folio Hasta",
        required=True,
    )
    folio_actual = fields.Integer(
        string="Folio Actual",
        help="Próximo folio a utilizar.",
    )
    folios_disponibles = fields.Integer(
        string="Folios Disponibles",
        compute="_compute_folios_disponibles",
        store=True,
    )
    porcentaje_usado = fields.Float(
        string="% Usado",
        compute="_compute_porcentaje_usado",
        store=True,
        digits=(5, 2),
    )
    fecha_autorizacion = fields.Date(
        string="Fecha Autorización",
        help="Fecha en que el SII autorizó este CAF.",
    )
    fecha_carga = fields.Datetime(
        string="Fecha de Carga",
        default=fields.Datetime.now,
        help="Fecha y hora en que se cargó el CAF en CuentaX.",
    )
    xml_content = fields.Binary(
        string="Archivo XML CAF",
        attachment=True,
    )
    xml_filename = fields.Char(
        string="Nombre Archivo",
    )
    private_key_pem = fields.Text(
        string="Clave Privada RSA",
        groups="base.group_system",
        help="Clave privada RSA extraída del CAF para firma TED.",
    )
    rut_empresa = fields.Char(
        string="RUT Empresa",
        help="RUT de la empresa según el elemento RE del CAF XML.",
    )
    ambiente = fields.Selection(
        selection=[
            ("certificacion", "Certificación"),
            ("produccion", "Producción"),
        ],
        string="Ambiente",
        required=True,
        default="certificacion",
    )
    state = fields.Selection(
        selection=[
            ("activo", "Activo"),
            ("agotado", "Agotado"),
            ("expirado", "Expirado"),
        ],
        string="Estado",
        default="activo",
        required=True,
    )
    necesita_renovacion = fields.Boolean(
        string="Necesita Renovación",
        compute="_compute_necesita_renovacion",
        store=True,
        help="Verdadero cuando queda menos del 10% de folios.",
    )

    # -------------------------------------------------------------------------
    # Constraints
    # -------------------------------------------------------------------------

    @api.constrains("folio_desde", "folio_hasta")
    def _check_folio_range(self):
        for record in self:
            if record.folio_desde <= 0 or record.folio_hasta <= 0:
                raise ValidationError(
                    _("Los folios deben ser números positivos.")
                )
            if record.folio_desde > record.folio_hasta:
                raise ValidationError(
                    _(
                        "El folio inicial (%(desde)s) no puede ser mayor "
                        "al folio final (%(hasta)s).",
                        desde=record.folio_desde,
                        hasta=record.folio_hasta,
                    )
                )

    @api.constrains("folio_actual", "folio_desde", "folio_hasta")
    def _check_folio_actual(self):
        for record in self:
            if not record.folio_actual:
                continue
            if (
                record.folio_actual < record.folio_desde
                or record.folio_actual > record.folio_hasta + 1
            ):
                raise ValidationError(
                    _(
                        "El folio actual (%(actual)s) debe estar entre "
                        "%(desde)s y %(hasta)s.",
                        actual=record.folio_actual,
                        desde=record.folio_desde,
                        hasta=record.folio_hasta,
                    )
                )

    _sql_constraints = [
        (
            "folio_range_unique",
            "unique(company_id, tipo_dte, folio_desde, folio_hasta, ambiente)",
            "Ya existe un CAF con el mismo rango de folios para este "
            "tipo de documento y ambiente.",
        ),
    ]

    # -------------------------------------------------------------------------
    # Computed fields
    # -------------------------------------------------------------------------

    @api.depends("tipo_dte", "folio_desde", "folio_hasta")
    def _compute_name(self):
        for record in self:
            if record.tipo_dte and record.folio_desde and record.folio_hasta:
                record.name = (
                    f"CAF Tipo {record.tipo_dte} "
                    f"[{record.folio_desde}-{record.folio_hasta}]"
                )
            else:
                record.name = _("Nuevo CAF")

    @api.depends("folio_actual", "folio_desde", "folio_hasta", "state")
    def _compute_folios_disponibles(self):
        for record in self:
            if record.state == "agotado":
                record.folios_disponibles = 0
            elif record.folio_actual:
                record.folios_disponibles = max(
                    0, record.folio_hasta - record.folio_actual + 1
                )
            else:
                record.folios_disponibles = (
                    record.folio_hasta - record.folio_desde + 1
                )

    @api.depends("folio_actual", "folio_desde", "folio_hasta")
    def _compute_porcentaje_usado(self):
        for record in self:
            total = record.folio_hasta - record.folio_desde + 1
            if total <= 0 or not record.folio_actual:
                record.porcentaje_usado = 0.0
            else:
                used = record.folio_actual - record.folio_desde
                record.porcentaje_usado = (used / total) * 100.0

    @api.depends("folios_disponibles", "folio_desde", "folio_hasta")
    def _compute_necesita_renovacion(self):
        for record in self:
            total = record.folio_hasta - record.folio_desde + 1
            threshold = max(10, total * 0.10)
            record.necesita_renovacion = (
                record.folios_disponibles < threshold
            )

    # -------------------------------------------------------------------------
    # Onchange
    # -------------------------------------------------------------------------

    @api.onchange("folio_desde")
    def _onchange_folio_desde(self):
        """Initialize folio_actual to folio_desde when setting range."""
        if self.folio_desde and not self.folio_actual:
            self.folio_actual = self.folio_desde

    # -------------------------------------------------------------------------
    # Business methods
    # -------------------------------------------------------------------------

    def consume_folio(self):
        """Consume the next available folio and return its number.

        Returns:
            int: The folio number consumed.

        Raises:
            UserError: If the CAF has no available folios.
        """
        self.ensure_one()
        if self.state != "activo":
            raise UserError(
                _(
                    "No se puede consumir un folio de un CAF en estado "
                    "'%(state)s'.",
                    state=dict(self._fields["state"].selection).get(
                        self.state, self.state
                    ),
                )
            )
        if not self.folio_actual:
            self.folio_actual = self.folio_desde
        if self.folio_actual > self.folio_hasta:
            raise UserError(
                _("El CAF %s no tiene folios disponibles.", self.name)
            )

        folio = self.folio_actual
        next_folio = folio + 1
        vals = {"folio_actual": next_folio}
        if next_folio > self.folio_hasta:
            vals["state"] = "agotado"
        self.write(vals)
        return folio

    def action_mark_exhausted(self):
        """Manually mark this CAF as exhausted."""
        for record in self:
            if record.state == "agotado":
                raise UserError(
                    _("El CAF %s ya está agotado.", record.name)
                )
            record.write({
                "state": "agotado",
                "folio_actual": record.folio_hasta + 1,
            })
