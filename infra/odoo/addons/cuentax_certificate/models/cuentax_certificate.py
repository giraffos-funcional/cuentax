# Copyright 2026 Giraffos
# License LGPL-3.0 or later (https://www.gnu.org/licenses/lgpl).

from odoo import api, fields, models, _
from odoo.exceptions import UserError


class CuentaxCertificate(models.Model):
    """Digital certificate (PFX/P12) storage for SII Chile."""

    _name = "cuentax.certificate"
    _description = "Certificado Digital SII"
    _order = "fecha_carga desc, id desc"

    name = fields.Char(
        string="Nombre",
        compute="_compute_name",
        store=True,
    )
    rut_titular = fields.Char(
        string="RUT Titular",
        required=True,
        help="RUT de la persona dueña del certificado.",
    )
    nombre_titular = fields.Char(
        string="Nombre Titular",
        help="Nombre extraído del certificado (CN).",
    )
    pfx_content = fields.Binary(
        string="Archivo PFX",
        attachment=True,
        groups="base.group_system",
    )
    pfx_filename = fields.Char(
        string="Nombre Archivo",
    )
    pfx_password = fields.Char(
        string="Contraseña PFX",
        groups="base.group_system",
        help="Contraseña para desencriptar el PFX. Requerida para recargar.",
    )
    fecha_vencimiento = fields.Date(
        string="Fecha Vencimiento",
    )
    dias_para_vencer = fields.Integer(
        string="Días para Vencer",
        compute="_compute_dias_vencer",
    )
    fecha_carga = fields.Datetime(
        string="Fecha de Carga",
        default=fields.Datetime.now,
    )
    empresa_ids = fields.Many2many(
        comodel_name="res.company",
        string="Empresas Asociadas",
        help="Empresas que usan este certificado para firmar DTEs.",
    )
    ambiente = fields.Selection(
        selection=[
            ("certificacion", "Certificación"),
            ("produccion", "Producción"),
        ],
        string="Ambiente",
        default="certificacion",
    )
    state = fields.Selection(
        selection=[
            ("activo", "Activo"),
            ("vencido", "Vencido"),
        ],
        string="Estado",
        default="activo",
        required=True,
    )

    _sql_constraints = [
        (
            "rut_titular_unique",
            "unique(rut_titular, ambiente)",
            "Ya existe un certificado para este titular en este ambiente.",
        ),
    ]

    @api.depends("rut_titular", "nombre_titular")
    def _compute_name(self):
        for record in self:
            if record.nombre_titular and record.rut_titular:
                record.name = f"{record.nombre_titular} ({record.rut_titular})"
            elif record.rut_titular:
                record.name = record.rut_titular
            else:
                record.name = _("Nuevo Certificado")

    @api.depends("fecha_vencimiento")
    def _compute_dias_vencer(self):
        today = fields.Date.today()
        for record in self:
            if record.fecha_vencimiento:
                record.dias_para_vencer = (
                    record.fecha_vencimiento - today
                ).days
            else:
                record.dias_para_vencer = 0
