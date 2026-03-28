# Copyright 2026 Giraffos
# License LGPL-3.0 or later (https://www.gnu.org/licenses/lgpl).

from odoo import api, fields, models


MONTH_SELECTION = [
    ("1", "Enero"),
    ("2", "Febrero"),
    ("3", "Marzo"),
    ("4", "Abril"),
    ("5", "Mayo"),
    ("6", "Junio"),
    ("7", "Julio"),
    ("8", "Agosto"),
    ("9", "Septiembre"),
    ("10", "Octubre"),
    ("11", "Noviembre"),
    ("12", "Diciembre"),
]


class L10nClIndicators(models.Model):
    """Monthly economic indicators for Chilean payroll calculations."""

    _name = "l10n_cl.indicators"
    _description = "Indicadores Económicos Mensuales Chile"
    _order = "year desc, month desc"
    _rec_name = "name"

    name = fields.Char(
        string="Período",
        compute="_compute_name",
        store=True,
    )
    month = fields.Selection(
        selection=MONTH_SELECTION,
        string="Mes",
        required=True,
    )
    year = fields.Integer(
        string="Año",
        required=True,
        default=lambda self: fields.Date.today().year,
    )
    uf = fields.Float(
        string="UF",
        digits=(10, 2),
        help="Unidad de Fomento - valor promedio del mes.",
    )
    utm = fields.Float(
        string="UTM",
        digits=(10, 0),
        help="Unidad Tributaria Mensual.",
    )
    uta = fields.Float(
        string="UTA",
        digits=(10, 0),
        help="Unidad Tributaria Anual (UTM x 12).",
    )
    imm = fields.Float(
        string="Ingreso Mínimo Mensual",
        digits=(10, 0),
        help="Sueldo mínimo mensual vigente.",
    )
    tope_imponible_afp = fields.Float(
        string="Tope Imponible AFP (UF)",
        digits=(5, 1),
        default=84.3,
    )
    tope_imponible_salud = fields.Float(
        string="Tope Imponible Salud (UF)",
        digits=(5, 1),
        default=84.3,
    )
    tope_seg_cesantia = fields.Float(
        string="Tope Seguro Cesantía (UF)",
        digits=(5, 1),
        default=126.6,
    )
    company_id = fields.Many2one(
        comodel_name="res.company",
        string="Compañía",
        default=lambda self: self.env.company,
    )

    _sql_constraints = [
        (
            "unique_period",
            "unique(month, year, company_id)",
            "Ya existe un registro de indicadores para este período.",
        ),
    ]

    @api.depends("month", "year")
    def _compute_name(self):
        month_dict = dict(MONTH_SELECTION)
        for record in self:
            month_name = month_dict.get(record.month, "")
            record.name = "{} {}".format(month_name, record.year)
