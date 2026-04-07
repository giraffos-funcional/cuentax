# Copyright 2026 Giraffos
# License LGPL-3.0 or later (https://www.gnu.org/licenses/lgpl).

from odoo import fields, models


class L10nClIsapre(models.Model):
    """Isapre - Institución de Salud Previsional."""

    _name = "l10n_cl.isapre"
    _description = "Isapre - Institución de Salud Previsional"
    _order = "name"

    name = fields.Char(
        string="Nombre",
        required=True,
    )
    code = fields.Char(
        string="Código",
        required=True,
    )
    previred_code = fields.Char(
        string="Código Previred",
        size=3,
        help="Código numérico para archivo Previred.",
    )
    active = fields.Boolean(
        default=True,
    )

    _sql_constraints = [
        (
            "code_unique",
            "unique(code)",
            "El código de la Isapre debe ser único.",
        ),
    ]
