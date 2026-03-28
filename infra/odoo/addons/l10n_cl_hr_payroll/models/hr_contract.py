# Copyright 2026 Giraffos
# License LGPL-3.0 or later (https://www.gnu.org/licenses/lgpl).

from odoo import fields, models


class HrContract(models.Model):
    """Extend hr.contract with Chilean payroll fields."""

    _inherit = "hr.contract"

    l10n_cl_gratificacion_type = fields.Selection(
        selection=[
            ("art47", "Art. 47 - 25% con tope 4.75 IMM"),
            ("art50", "Art. 50 - 30% utilidades"),
            ("none", "Sin gratificación"),
        ],
        string="Tipo Gratificación",
        default="art47",
    )
    l10n_cl_colacion = fields.Float(
        string="Colación",
        digits=(10, 0),
        default=0,
    )
    l10n_cl_movilizacion = fields.Float(
        string="Movilización",
        digits=(10, 0),
        default=0,
    )
    l10n_cl_contract_type = fields.Selection(
        selection=[
            ("indefinido", "Contrato Indefinido"),
            ("plazo_fijo", "Contrato Plazo Fijo"),
            ("obra_faena", "Por Obra o Faena"),
        ],
        string="Tipo Contrato Chile",
        default="indefinido",
    )
