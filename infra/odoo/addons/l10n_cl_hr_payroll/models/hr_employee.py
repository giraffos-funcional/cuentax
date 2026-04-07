# Copyright 2026 Giraffos
# License LGPL-3.0 or later (https://www.gnu.org/licenses/lgpl).

from odoo import fields, models


class HrEmployee(models.Model):
    """Extend hr.employee with Chilean social security fields."""

    _inherit = "hr.employee"

    l10n_cl_afp_id = fields.Many2one(
        comodel_name="l10n_cl.afp",
        string="AFP",
    )
    l10n_cl_isapre_id = fields.Many2one(
        comodel_name="l10n_cl.isapre",
        string="Isapre",
    )
    l10n_cl_health_plan = fields.Selection(
        selection=[
            ("fonasa", "FONASA"),
            ("isapre", "Isapre"),
        ],
        string="Plan de Salud",
        default="fonasa",
    )
    l10n_cl_isapre_cotizacion_uf = fields.Float(
        string="Cotización Isapre (UF)",
        digits=(5, 2),
        help="Monto pactado con la Isapre en UF.",
    )
    l10n_cl_cargas_familiares = fields.Integer(
        string="Cargas Familiares",
        default=0,
    )
    l10n_cl_apv_amount = fields.Float(
        string="Monto APV",
        digits=(10, 0),
        help="Ahorro Previsional Voluntario mensual en pesos.",
    )
    l10n_cl_apv_regime = fields.Selection(
        selection=[
            ("A", "Régimen A (Rebaja Base Tributable)"),
            ("B", "Régimen B (Bonificación Fiscal)"),
        ],
        string="Régimen APV",
    )
    l10n_cl_portal_pin = fields.Char(
        string="Portal PIN",
        size=6,
        help="PIN for employee self-service portal access.",
    )
