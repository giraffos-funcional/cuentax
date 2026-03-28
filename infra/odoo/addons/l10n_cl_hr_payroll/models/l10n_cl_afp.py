# Copyright 2026 Giraffos
# License LGPL-3.0 or later (https://www.gnu.org/licenses/lgpl).

from odoo import fields, models


class L10nClAfp(models.Model):
    """AFP - Administradora de Fondos de Pensiones."""

    _name = "l10n_cl.afp"
    _description = "AFP - Administradora de Fondos de Pensiones"
    _order = "name"

    name = fields.Char(
        string="Nombre",
        required=True,
    )
    code = fields.Char(
        string="Código",
        required=True,
    )
    dependent_rate = fields.Float(
        string="Comisión Dependiente (%)",
        digits=(5, 2),
        help="Comisión porcentual cobrada al trabajador dependiente.",
    )
    mandatory_rate = fields.Float(
        string="Cotización Obligatoria (%)",
        digits=(5, 2),
        default=10.0,
        help="Cotización obligatoria para el fondo de pensiones (10%).",
    )
    sis_rate = fields.Float(
        string="SIS (%)",
        digits=(5, 2),
        default=1.53,
        help="Seguro de Invalidez y Sobrevivencia, pagado por el empleador.",
    )
    active = fields.Boolean(
        default=True,
    )

    _sql_constraints = [
        (
            "code_unique",
            "unique(code)",
            "El código de la AFP debe ser único.",
        ),
    ]
